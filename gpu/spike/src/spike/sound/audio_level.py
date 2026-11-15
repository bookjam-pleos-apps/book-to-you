"""말소리 음량을 맞춘다. 순수 함수."""
import numpy as np

SPEECH_FLOOR = 0.01
TARGET_RMS = 0.1
MAX_PEAK = 0.95


def level_gain(samples: np.ndarray) -> float:
    """음량이 문장마다 달라 음색 판단을 흐리므로 유성 구간 RMS를 맞춘다. 피크가 넘지 않게 이득을 제한한다."""
    loud = samples[np.abs(samples) >= SPEECH_FLOOR]
    if loud.size == 0:
        return 1.0
    gain = TARGET_RMS / float(np.sqrt(np.mean(loud**2)))
    return min(gain, MAX_PEAK / float(np.abs(samples).max()))


def leveled(samples: np.ndarray) -> np.ndarray:
    return samples * level_gain(samples)
