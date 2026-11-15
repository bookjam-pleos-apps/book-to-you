"""감정이 실렸는지 보는 운율 지표. 피치 추적기는 Protocol로만 알고, 지표는 F0 배열과 Audio만 받는 순수 함수다."""
from typing import Protocol

import numpy as np

from spike.sound.audio import Audio
from spike.sound.speech_activity import frame_levels_db, voiced_frames

PITCH_STEP_SEC = 0.01
MIN_PITCHED_FRAMES = 20
MIN_SPEECH_FRAMES = 10
LOW_PERCENTILE = 10
HIGH_PERCENTILE = 90
SEMITONES_PER_OCTAVE = 12


class PitchTracker(Protocol):
    def track(self, audio: Audio) -> np.ndarray:
        """PITCH_STEP_SEC 간격의 F0(Hz). 무성 프레임은 NaN이다."""
        ...


def pitched_frames(f0: np.ndarray) -> np.ndarray | None:
    """피치가 잡힌(NaN이 아닌) F0만 남긴다. 0.2초보다 적으면 무엇을 재기엔 모자라 None이다."""
    pitched = f0[~np.isnan(f0)]
    if pitched.size < MIN_PITCHED_FRAMES:
        return None
    return pitched


def median_semitones(f0: np.ndarray) -> float | None:
    pitched = pitched_frames(f0)
    return None if pitched is None else float(np.median(SEMITONES_PER_OCTAVE * np.log2(pitched)))


def f0_range_semitones(f0: np.ndarray) -> float | None:
    """음높이가 움직인 폭(반음). 신날수록 넓고 차분할수록 좁다.

    반음은 로그 척도라 남녀 화자를 같은 기준으로 본다. 최댓값-최솟값 대신 백분위 폭을 쓰는 이유는
    피치 추적의 옥타브 오류가 양끝에 이상치를 만들기 때문이다. 유성 프레임이 0.2초보다 적으면 잴 수 없다.
    """
    pitched = pitched_frames(f0)
    if pitched is None:
        return None
    low, high = np.percentile(SEMITONES_PER_OCTAVE * np.log2(pitched), [LOW_PERCENTILE, HIGH_PERCENTILE])
    return float(high - low)


def energy_spread_db(audio: Audio) -> float | None:
    """말소리 프레임 세기의 흩어짐(dB). 강세를 크게 주며 읽을수록 크다."""
    voiced = voiced_frames(audio)
    if voiced.sum() < MIN_SPEECH_FRAMES:
        return None
    return float(np.std(frame_levels_db(audio)[voiced]))
