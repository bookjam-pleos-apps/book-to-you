"""부모 녹음 하나에서 style 구별 검사에 쓰는 값을 잰다. 피치 배열과 Audio만 받는 순수 함수다."""
from dataclasses import dataclass

import numpy as np

from spike.sound.audio import Audio
from spike.sound.prosody import median_semitones
from spike.sound.speech_activity import voiced_duration


@dataclass(frozen=True)
class ClipMeasure:
    """voiced_seconds는 앞뒤 무음을 뺀 길이다. 대본 음절 수를 이 값으로 나누면 reference_check.speech_rate와 같다."""
    voiced_seconds: float
    median_semitones: float | None


def measure_clip(audio: Audio, f0: np.ndarray) -> ClipMeasure:
    return ClipMeasure(voiced_duration(audio), median_semitones(f0))


def clip_measure_document(measure: ClipMeasure) -> dict[str, float | None]:
    return {"voicedSeconds": measure.voiced_seconds, "medianSemitones": measure.median_semitones}
