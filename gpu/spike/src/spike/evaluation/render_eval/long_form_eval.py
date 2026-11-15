"""긴 이야기에서 단위 경계의 음량·음높이 변화를 잰다. 합격 판정이 아니라 조건끼리 비교하는 참고 수치다."""
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from spike.sound.audio import Audio
from spike.sound.prosody import PitchTracker, median_semitones
from spike.sound.speech_activity import DIGITAL_SILENCE_AMPLITUDE, speech_bounds

EDGE_SEC = 1.0


@dataclass(frozen=True)
class Boundary:
    unit: int
    at_sec: float
    delta_energy_db: float
    delta_f0_semitones: float | None


def _edge(audio: Audio, at_end: bool) -> np.ndarray | None:
    """말소리의 맨 앞이나 맨 뒤 1초. 단위 앞뒤 무음이 세기를 끌어내리지 않게 무음은 뺀다."""
    bounds = speech_bounds(audio)
    if bounds is None:
        return None
    start, end = bounds
    window = int(audio.sample_rate * EDGE_SEC)
    return audio.samples[max(start, end - window):end] if at_end else audio.samples[start:min(end, start + window)]


def _level_db(samples: np.ndarray) -> float:
    return float(20 * np.log10(max(float(np.sqrt(np.mean(samples**2))), DIGITAL_SILENCE_AMPLITUDE)))


def _boundary(unit: int, before: Audio, after: Audio, after_start: int, tracker: PitchTracker) -> Boundary | None:
    """말소리가 없는 단위는 잴 수 없어 건너뛴다. 그런 단위는 CER 검사에서 이미 실패로 남는다."""
    tail, head = _edge(before, at_end=True), _edge(after, at_end=False)
    if tail is None or head is None:
        return None
    rate = before.sample_rate
    tail_f0, head_f0 = median_semitones(tracker.track(Audio(tail, rate))), median_semitones(tracker.track(Audio(head, rate)))
    delta_f0 = None if tail_f0 is None or head_f0 is None else head_f0 - tail_f0
    return Boundary(unit, after_start / rate, _level_db(head) - _level_db(tail), delta_f0)


def measure_boundaries(units: Sequence[Audio], starts: Sequence[int], tracker: PitchTracker) -> list[Boundary]:
    measured = (
        _boundary(index, before, after, start, tracker)
        for index, (before, after, start) in enumerate(zip(units, units[1:], starts[1:]))
    )
    return [boundary for boundary in measured if boundary is not None]
