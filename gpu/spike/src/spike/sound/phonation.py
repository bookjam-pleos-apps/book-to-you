"""참조가 지시한 발성으로 녹음됐는지 본다. 속삭임이라면 성대가 울리지 않아야 한다. F0 배열과 Audio만 받는 순수 함수다."""
import numpy as np

from spike.sound.audio import Audio
from spike.sound.prosody import PITCH_STEP_SEC, pitched_frames
from spike.sound.speech_activity import FRAME_SEC, voiced_frames

# pYIN은 속삭임에서도 상한(490~570Hz) 근처에 가짜 피치를 잡는다. 본인 보통 발성 대역 안의 F0만 유성으로 센다.
BAND_LOW = 0.6
BAND_HIGH = 1.8
# EARS 56~75세 여성 3명 실측: 진짜 whisper 0.00~0.13, regular·slow·serenity 0.34~0.80
WHISPER_MAX_VOICED_RATIO = 0.15
MIN_ACTIVE_FRAMES = 20


def reference_pitch_hz(f0: np.ndarray) -> float | None:
    """본인 보통 발성(calm 참조)의 F0 중앙값. 유성 대역의 기준이 된다."""
    pitched = pitched_frames(f0)
    if pitched is None:
        return None
    return float(np.median(pitched))


def voiced_ratio(f0: np.ndarray, audio: Audio, reference_hz: float) -> float | None:
    """말소리 구간 중 F0가 본인 보통 발성 대역에 든 프레임의 비율. 속삭임은 0에 가깝다."""
    active = _active_at_pitch_rate(audio, f0.size)
    if active.sum() < MIN_ACTIVE_FRAMES:
        return None
    pitched = np.nan_to_num(f0, nan=0.0)
    in_band = (pitched >= BAND_LOW * reference_hz) & (pitched <= BAND_HIGH * reference_hz)
    return float(in_band[active].mean())


def is_whisper(ratio: float | None) -> bool | None:
    if ratio is None:
        return None
    return ratio <= WHISPER_MAX_VOICED_RATIO


def _active_at_pitch_rate(audio: Audio, length: int) -> np.ndarray:
    """에너지로 찾은 말소리 프레임(20ms)을 피치 프레임(10ms) 간격으로 늘려 F0 배열과 길이를 맞춘다."""
    repeated = np.repeat(voiced_frames(audio), round(FRAME_SEC / PITCH_STEP_SEC))[:length]
    return np.pad(repeated, (0, length - repeated.size))
