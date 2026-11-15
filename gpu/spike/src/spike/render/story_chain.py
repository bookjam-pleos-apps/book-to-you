"""앞 묶음을 다음 묶음의 프롬프트 문맥으로 잇는 규칙. 순수 로직."""
from collections.abc import Sequence
from dataclasses import replace

import numpy as np

from spike.sound.audio import Audio
from spike.sound.audio_level import leveled
from spike.clone.budget import CODEC_TOKENS_PER_SEC
from spike.clone.engine.clone_port import CloneEngine, PromptContext
from spike.sound.speech_activity import speech_bounds
from spike.story.story_plan import StorySentence
from spike.render.story_render import RenderedSentence, RenderOne, RenderSettings, Transcribe, render_sentence

CONTEXT_TAIL_PAD_SEC = 0.5
DECODER_CHUNK_CODES = 300
MAX_CONTEXT_SEC = 35.0
JUNCTION_NEAR_SEC = 1.0


def chain_context(previous: RenderedSentence) -> PromptContext:
    """말소리만 남겨 음량을 맞추고 끝에 무음을 붙인다. 무음이 없으면 앞 대본이 새어 나온다(#341)."""
    audio = previous.audio
    bounds = speech_bounds(audio)
    if bounds is None:
        raise ValueError(f"앞 묶음에 말소리가 없어 문맥으로 쓸 수 없습니다: {previous.sentence.text[:20]}")
    pad = np.zeros(int(audio.sample_rate * CONTEXT_TAIL_PAD_SEC), dtype=np.float32)
    speech = leveled(audio.samples[bounds[0]:bounds[1]])
    return PromptContext(Audio(np.concatenate([speech, pad]), audio.sample_rate), previous.sentence.text)


def _usable_as_context(previous: RenderedSentence) -> bool:
    """검사를 통과하지 못한 소리를 문맥으로 쓰면 문제가 다음 묶음으로 번진다. 말소리 없는 묶음도 렌더를 멈추지 않고 건너뛴다."""
    audio = previous.audio
    fits = audio.duration_sec <= MAX_CONTEXT_SEC
    return previous.passed and fits and speech_bounds(audio) is not None


def next_context(done: Sequence[RenderedSentence]) -> PromptContext | None:
    if not done or not _usable_as_context(done[-1]):
        return None
    return chain_context(done[-1])


def chained_render(engine: CloneEngine, transcribe: Transcribe, settings: RenderSettings) -> RenderOne:
    def render_one(sentence: StorySentence, done: Sequence[RenderedSentence]) -> RenderedSentence:
        return render_sentence(sentence, engine, transcribe, replace(settings, context=next_context(done)))

    return render_one


def source_context(sources: Sequence[RenderedSentence], index: int) -> PromptContext | None:
    """문맥을 이 렌더의 결과가 아니라 다른 렌더에서 가져온다. 생성음이 다시 생성음의 문맥이 되는 되먹임이 없다."""
    if index <= 0 or not _usable_as_context(sources[index - 1]):
        return None
    return chain_context(sources[index - 1])


def one_hop_render(
    engine: CloneEngine,
    transcribe: Transcribe,
    settings: RenderSettings,
    sources: Sequence[RenderedSentence],
    first_unit: int = 0,
) -> RenderOne:
    def render_one(sentence: StorySentence, done: Sequence[RenderedSentence]) -> RenderedSentence:
        context = source_context(sources, first_unit + len(done))
        return render_sentence(sentence, engine, transcribe, replace(settings, context=context))

    return render_one


def decoder_junction_sec(prompt_codes: int) -> float:
    """디코더가 300코드마다 끊는 첫 지점이 생성 음성의 몇 초에 오는지. 프롬프트 코드 수만으로 정해진다."""
    return -prompt_codes % DECODER_CHUNK_CODES / CODEC_TOKENS_PER_SEC


def decoder_junctions_sec(prompt_codes: int, duration_sec: float) -> list[float]:
    """긴 묶음에는 접합부가 여러 번 온다. 지목한 순간이 접합부 근처인지 볼 때 모두 필요하다."""
    first, step = decoder_junction_sec(prompt_codes), DECODER_CHUNK_CODES / CODEC_TOKENS_PER_SEC
    return [float(at) for at in np.arange(first, duration_sec, step)]


def _near_unit_junction(mark_sec: float, item: RenderedSentence, start_sec: float) -> bool:
    if item.prompt_codes is None:
        return False
    duration_sec = item.audio.duration_sec
    return any(abs(mark_sec - start_sec - at) <= JUNCTION_NEAR_SEC for at in decoder_junctions_sec(item.prompt_codes, duration_sec))


def near_decoder_junction(mark_sec: float, units: Sequence[RenderedSentence], starts_sec: Sequence[float]) -> bool:
    return any(_near_unit_junction(mark_sec, item, start) for item, start in zip(units, starts_sec))
