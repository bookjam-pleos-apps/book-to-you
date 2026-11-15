"""녹음 직후 참조를 재서 클론 전에 다시 녹음할지 정한다. 피치 배열과 Audio만 받는 순수 함수다."""
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from spike.sound.audio import Audio
from spike.sound.prosody import f0_range_semitones, median_semitones
from spike.sound.speech_activity import frame_levels_db, voiced_duration, voiced_frames
from spike.clone.reference.style_checks import Bound, StyleCheck

# 앞뒤 무음이 0.5초보다 짧으면 잡음 바닥을 믿을 수 없다. 녹음 안내는 앞뒤 1~2초를 비우게 한다.
MIN_EDGE_SILENCE_FRAMES = 25


@dataclass(frozen=True)
class ReferenceMeasure:
    style: str
    speech_rate: float | None
    median_semitones: float | None
    range_semitones: float | None
    noise_margin_db: float | None


def measure_reference(style: str, audio: Audio, f0: np.ndarray, syllables: int) -> ReferenceMeasure:
    return ReferenceMeasure(style, speech_rate(audio, syllables), median_semitones(f0), f0_range_semitones(f0), noise_margin_db(audio))


def speech_rate(audio: Audio, syllables: int) -> float | None:
    """앞뒤 무음을 뺀 음절/초. 녹음 버튼 앞뒤의 무음은 읽는 속도가 아니다."""
    seconds = voiced_duration(audio)
    return syllables / seconds if seconds > 0 else None


def noise_margin_db(audio: Audio) -> float | None:
    """말소리 세기 중앙값과 앞뒤 무음 세기 중앙값의 차이. 말 사이 멈춤은 숨소리가 섞여 쓰지 않는다."""
    levels, voiced = frame_levels_db(audio), voiced_frames(audio)
    on = np.flatnonzero(voiced)
    if on.size == 0:
        return None
    edges = np.concatenate([levels[: on[0]], levels[on[-1] + 1:]])
    if edges.size < MIN_EDGE_SILENCE_FRAMES:
        return None
    return float(np.median(levels[voiced]) - np.median(edges))


def style_problems(check: StyleCheck, calm: ReferenceMeasure, measure: ReferenceMeasure) -> list[str]:
    """참조가 calm과 기준만큼 다르지 않으면 다시 녹음할 이유를 돌려준다. 빈 목록이면 클론으로 넘어간다.

    조건 중 하나면 통과다. 잴 수 없는 값은 통과 근거로 쓰지 않는다.
    """
    if any(_meets(bound, calm, measure) for bound in check.any_of):
        return []
    return [f"calm과 구별되지 않습니다. calm 대비 기준: {' 또는 '.join(describe_bound(bound) for bound in check.any_of)}"]


def describe_bound(bound: Bound) -> str:
    label, amount = _LABELS[bound.metric]
    if bound.at_least is not None:
        return f"{label} {amount(bound.at_least)} 이상"
    return f"{label} {amount(bound.at_most)} 이하"


def _meets(bound: Bound, calm: ReferenceMeasure, measure: ReferenceMeasure) -> bool:
    change = CHANGES[bound.metric](calm, measure)
    if change is None:
        return False
    if bound.at_least is not None:
        return change >= bound.at_least
    return bound.at_most is not None and change <= bound.at_most


def semitone_shift(calm: ReferenceMeasure, other: ReferenceMeasure) -> float | None:
    if calm.median_semitones is None or other.median_semitones is None:
        return None
    return other.median_semitones - calm.median_semitones


def speech_rate_change(calm: ReferenceMeasure, other: ReferenceMeasure) -> float | None:
    """calm보다 느리면 음수다. −0.05는 5% 느리다는 뜻이다."""
    if not calm.speech_rate or other.speech_rate is None:
        return None
    return other.speech_rate / calm.speech_rate - 1


CHANGES: dict[str, Callable[[ReferenceMeasure, ReferenceMeasure], float | None]] = {
    "pitchShiftSemitones": semitone_shift,
    "speechRateChange": speech_rate_change,
}
_LABELS: dict[str, tuple[str, Callable[[float], str]]] = {
    "pitchShiftSemitones": ("음높이", lambda value: f"{value:+.1f}반음"),
    "speechRateChange": ("말 속도", lambda value: f"{value:+.0%}"),
}
