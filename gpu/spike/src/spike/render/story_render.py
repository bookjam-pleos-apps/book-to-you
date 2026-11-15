"""동화 한 편을 문장 단위로 생성한다. 실패한 문장은 seed를 바꿔 재생성하고 쉼을 넣어 잇는다."""
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from functools import reduce
from itertools import accumulate
from pathlib import Path

import numpy as np

from spike.render.attempt.attempt_policy import attempt_seed, attempts_done, attempts_made, is_last_attempt, prefer_later
from spike.sound.audio import Audio
from spike.sound.audio_level import leveled
from spike.clone.budget import reached_budget
from spike.clone.engine.clone_port import CloneEngine, CloneRequest, PromptContext
from spike.render.attempt.render_qc import AttemptCheck, check_attempt
from spike.render.tail.repeat_tail import spoken_text
from spike.story.story_plan import StorySentence
from spike.render.tail.tail_cut import CutTake, cut_tail
from spike.render.voice.voice_note import VoiceNote

@dataclass(frozen=True)
class Reference:
    path: Path
    text: str


@dataclass(frozen=True)
class RenderSettings:
    model: str
    seed: int
    references: dict[str, Reference]
    temperature: float | None = None
    context: PromptContext | None = None
    repetition_penalty: float | None = None
    subtalker_greedy: bool = False


@dataclass(frozen=True)
class RenderedSentence:
    sentence: StorySentence
    audio: Audio
    transcript: str
    cer: float
    attempts: int
    passed: bool
    seed: int
    temperature: float | None
    context_used: bool = False
    gen_ms: int | None = None
    prompt_codes: int | None = None
    head_share: float | None = None
    voice: VoiceNote | None = None


Transcribe = Callable[[Audio], str]
RenderOne = Callable[[StorySentence, Sequence[RenderedSentence]], RenderedSentence]


def _context_for_attempt(settings: RenderSettings, attempt: int) -> PromptContext | None:
    """문맥이 원인인 실패가 끝까지 남지 않도록 마지막 시도는 문맥 없이 만든다."""
    return None if is_last_attempt(attempt) else settings.context


def _request(sentence: StorySentence, settings: RenderSettings, attempt: int) -> CloneRequest:
    reference = settings.references[sentence.style]
    return CloneRequest(
        text=spoken_text(sentence),
        reference_path=reference.path,
        reference_text=reference.text,
        model=settings.model,
        seed=attempt_seed(settings.seed, attempt),
        non_streaming=True,
        x_vector_only=False,
        temperature=settings.temperature,
        context=_context_for_attempt(settings, attempt),
        repetition_penalty=settings.repetition_penalty,
        subtalker_greedy=settings.subtalker_greedy,
    )


@dataclass(frozen=True)
class _Attempt:
    rendered: RenderedSentence
    check: AttemptCheck


def _heard(cut: CutTake, hit_budget: bool, transcribe: Transcribe) -> str:
    """폭주한 출력은 어차피 실패다. 전사기가 길이 제한으로 거부하면 재시도 전에 렌더가 멈추므로 전사하지 않는다.
    꼬리를 자르지 못한 소리도 받아쓰지 않고 실패로 둔다. whisper는 같은 문장 반복을 한 번만 적어 통과시킬 수 있다.
    낱말 꼬리를 자를 때 이미 받아쓴 앞부분은 같은 소리라 다시 받아쓰지 않는다."""
    if hit_budget or cut.audio is None:
        return ""
    if cut.head_transcript is not None:
        return cut.head_transcript
    return transcribe(cut.audio)


def _attempt_once(
    sentence: StorySentence,
    engine: CloneEngine,
    transcribe: Transcribe,
    settings: RenderSettings,
    attempt: int,
) -> _Attempt:
    request = _request(sentence, settings, attempt)
    synthesis = engine.synthesize(request)
    hit_budget = reached_budget(synthesis.audio.duration_sec, request.text)
    cut = cut_tail(sentence, synthesis.audio, transcribe)
    audio = cut.audio
    transcript = _heard(cut, hit_budget, transcribe)
    check = check_attempt(request, sentence.text, hit_budget, transcript)
    rendered = RenderedSentence(
        sentence, synthesis.audio if audio is None else audio, transcript, check.error_rate, attempts_made(attempt), check.passed, request.seed, request.temperature,
        request.context is not None, synthesis.gen_ms, synthesis.prompt_codes,
        cut.head_share,
    )
    return _Attempt(rendered, check)


def _best_attempt(
    sentence: StorySentence,
    engine: CloneEngine,
    transcribe: Transcribe,
    settings: RenderSettings,
    attempt: int = 0,
) -> _Attempt:
    """모두 실패하면 가장 덜 나쁜 시도를 남긴다. 시도 횟수는 실제로 만든 횟수를 적고 seed는 고른 시도의 값을 유지한다."""
    current = _attempt_once(sentence, engine, transcribe, settings, attempt)
    if attempts_done(attempt, current.check.passed):
        return current
    later = _best_attempt(sentence, engine, transcribe, settings, attempt + 1)
    if prefer_later(current.check, later.check):
        return later
    return replace(current, rendered=replace(current.rendered, attempts=later.rendered.attempts))


def render_sentence(
    sentence: StorySentence,
    engine: CloneEngine,
    transcribe: Transcribe,
    settings: RenderSettings,
) -> RenderedSentence:
    return _best_attempt(sentence, engine, transcribe, settings).rendered


def independent_render(engine: CloneEngine, transcribe: Transcribe, settings: RenderSettings) -> RenderOne:
    def render_one(sentence: StorySentence, _done: Sequence[RenderedSentence]) -> RenderedSentence:
        return render_sentence(sentence, engine, transcribe, settings)

    return render_one


LEVELERS: dict[str, Callable[[np.ndarray], np.ndarray]] = {"none": lambda samples: samples, "per_unit": leveled}


def leveled_units(rendered: Sequence[RenderedSentence], leveling: str) -> list[Audio]:
    return [Audio(LEVELERS[leveling](item.audio.samples), item.audio.sample_rate) for item in rendered]


def _pause(rendered: RenderedSentence) -> np.ndarray:
    return np.zeros(rendered.audio.sample_rate * rendered.sentence.pause_after_ms // 1000, dtype=np.float32)


def unit_starts(rendered: Sequence[RenderedSentence]) -> list[int]:
    """각 단위가 이어 붙인 이야기의 몇 번째 샘플에서 시작하는지. 반올림한 초를 더하면 뒤로 갈수록 어긋난다."""
    lengths = [len(item.audio.samples) + len(_pause(item)) for item in rendered]
    return [0, *accumulate(lengths)][:-1]


def story_sample_count(rendered: Sequence[RenderedSentence]) -> int:
    return sum(len(item.audio.samples) + len(_pause(item)) for item in rendered)


def with_pause(rendered: Sequence[RenderedSentence], pause_ms: int) -> list[RenderedSentence]:
    return [replace(item, sentence=replace(item.sentence, pause_after_ms=pause_ms)) for item in rendered]


def stitch(rendered: Sequence[RenderedSentence], leveling: str = "per_unit") -> Audio:
    units = leveled_units(rendered, leveling)
    parts = [part for unit, item in zip(units, rendered) for part in (unit.samples, _pause(item))]
    return Audio(np.concatenate(parts), rendered[0].audio.sample_rate)


def ignore_progress(_: list[RenderedSentence]) -> None:
    return None


def render_story(
    sentences: Sequence[StorySentence],
    render_one: RenderOne,
    on_progress: Callable[[list[RenderedSentence]], None] = ignore_progress,
) -> list[RenderedSentence]:
    """단위가 끝날 때마다 알린다. 긴 렌더가 뒤에서 죽어도 앞 결과가 남아야 한다."""

    def advance(done: list[RenderedSentence], sentence: StorySentence) -> list[RenderedSentence]:
        rendered = [*done, render_one(sentence, done)]
        on_progress(rendered)
        return rendered

    return reduce(advance, sentences, [])
