"""렌더한 단위를 파일로 저장하고 다시 읽는다. 재조립과 경계 측정이 GPU 없이 돌게 한다."""
import json
from collections.abc import Iterable, Mapping, Sequence
from functools import reduce
from math import log10
from pathlib import Path

import soundfile as sf

from spike.sound.atomic import atomic_path
from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.sound.audio_level import level_gain
from spike.render.tail.repeat_check import repeat_suspect
from spike.story.story_plan import StorySentence, sentence_from_line, sentence_line
from spike.render.story_render import RenderedSentence
from spike.render.voice.voice_note import VoiceNote

UNITS_DIR = "units"
REPORT_NAME = "report.json"
STORY_NAME = "story.wav"
SETTINGS_NAME = "render_settings.json"


def unit_path(out: Path, index: int) -> Path:
    return out / UNITS_DIR / f"{index:04d}.wav"


def report_line(item: RenderedSentence) -> dict:
    return {
        "text": item.sentence.text,
        "style": item.sentence.style,
        "pauseAfterMs": item.sentence.pause_after_ms,
        "transcript": item.transcript,
        "cer": round(item.cer, 4),
        "attempts": item.attempts,
        "passed": item.passed,
        "seed": item.seed,
        "temperature": item.temperature,
        "durationSec": round(item.audio.duration_sec, 2),
        "gainDb": round(20 * log10(level_gain(item.audio.samples)), 2),
        "contextUsed": item.context_used,
        "genMs": item.gen_ms,
        "promptCodes": item.prompt_codes,
        "headShare": None if item.head_share is None else round(item.head_share, 3),
        "repeatSuspect": repeat_suspect(item.sentence, item.head_share),
        "voice": None if item.voice is None else voice_line(item.voice),
    }


def voice_line(note: VoiceNote) -> dict:
    return {
        "judgedStyle": note.judged_style, "group": round(note.group, 4), "reference": round(note.reference, 4),
        "rerolls": note.rerolls, "fallback": note.fallback,
    }


def _write_report(out: Path, rendered: Sequence[RenderedSentence]) -> None:
    with atomic_path(out / REPORT_NAME) as tmp:
        tmp.write_text(json.dumps([report_line(item) for item in rendered], ensure_ascii=False, indent=1), encoding="utf-8")


def save_unit_audio(path: Path, audio: Audio) -> None:
    """원본 샘플을 잃지 않도록 32비트 부동소수로 저장한다."""
    with atomic_path(path) as tmp:
        sf.write(tmp, audio.samples, audio.sample_rate, subtype="FLOAT")


def save_progress(out: Path, rendered: Sequence[RenderedSentence]) -> None:
    """마지막 단위만 새로 쓴다."""
    save_unit_audio(unit_path(out, len(rendered) - 1), rendered[-1].audio)
    _write_report(out, rendered)


def save_rendered(out: Path, rendered: Sequence[RenderedSentence]) -> None:
    """라운드 렌더처럼 단위가 순서대로 끝나지 않을 때 모든 단위와 report를 한 번에 쓴다."""
    reduce(lambda saved, pair: save_unit_audio(unit_path(out, pair[0]), pair[1].audio) or saved + 1, enumerate(rendered), 0)
    _write_report(out, rendered)


def save_story(path: Path, story: Audio) -> None:
    with atomic_path(path) as tmp:
        sf.write(tmp, story.samples, story.sample_rate)


def save_render_settings(out: Path, settings: Mapping[str, object]) -> None:
    """조건 라벨은 폴더 이름이 아니라 이 기록을 믿는다. report에는 샘플링 설정이 다 남지 않는다."""
    with atomic_path(out / SETTINGS_NAME) as tmp:
        tmp.write_text(json.dumps(settings, ensure_ascii=False, indent=1, default=str), encoding="utf-8")


def _sentence(line: dict) -> StorySentence:
    return sentence_from_line(line)


def _loaded_unit(out: Path, index: int, line: dict) -> RenderedSentence:
    """체이닝 전에 만든 report에는 문맥 항목이 없다."""
    return RenderedSentence(
        sentence=_sentence(line),
        audio=read_audio(unit_path(out, index)),
        transcript=line["transcript"],
        cer=line["cer"],
        attempts=line["attempts"],
        passed=line["passed"],
        seed=line["seed"],
        temperature=line["temperature"],
        context_used=line.get("contextUsed", False),
        gen_ms=line.get("genMs"),
        prompt_codes=line.get("promptCodes"),
        head_share=line.get("headShare"),
    )


def _report_lines(out: Path) -> list[dict]:
    return json.loads((out / REPORT_NAME).read_text(encoding="utf-8"))


def load_units(out: Path) -> list[RenderedSentence]:
    return [_loaded_unit(out, index, line) for index, line in enumerate(_report_lines(out))]


def load_chosen_units(out: Path, indices: Iterable[int]) -> dict[int, RenderedSentence]:
    """필요한 음성만 읽는다. 원격 장비에는 쓰는 단위의 음성만 올리기 때문이다."""
    lines = _report_lines(out)
    return {index: _loaded_unit(out, index, lines[index]) for index in indices}


def load_unit_texts(out: Path) -> list[str]:
    return [line["text"] for line in _report_lines(out)]


def load_unit_durations(out: Path) -> list[float]:
    """report에는 소수 둘째 자리까지 반올림해 저장한다. 정확한 길이는 음성으로 다시 잰다."""
    return [line["durationSec"] for line in _report_lines(out)]


def load_plan(out: Path) -> list[StorySentence]:
    """이전 렌더와 같은 대본, 같은 쉼으로 다시 만들 때 쓴다. 조건 차이만 남기려면 묶음 경계가 같아야 한다."""
    return [_sentence(line) for line in _report_lines(out)]


def save_plan(out: Path, sentences: Sequence[StorySentence]) -> None:
    """load_plan이 읽는 세 필드만 쓴다. 렌더 전이라 load_units로는 읽을 수 없다."""
    if (out / REPORT_NAME).exists():
        raise FileExistsError(f"이미 있는 계획이나 렌더 결과는 덮어쓰지 않습니다: {out / REPORT_NAME}")
    with atomic_path(out / REPORT_NAME) as tmp:
        tmp.write_text(json.dumps([sentence_line(item) for item in sentences], ensure_ascii=False, indent=1), encoding="utf-8")


def refuse_overwriting_plan(plan_dir: Path, out: Path) -> None:
    """같은 폴더에 쓰면 비교할 원본 음성과 report가 덮인다."""
    if plan_dir.resolve() == out.resolve():
        raise ValueError(f"계획을 읽은 폴더에 다시 쓸 수 없습니다: {out}")
