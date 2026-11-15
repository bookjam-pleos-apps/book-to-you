"""반복 생성(repeat_tail)한 단위처럼 들리는 가짜 생성음. 같은 소리를 쉼을 두고 두 번 낸다."""
import numpy as np

TAKE_SEC = 1.0
GAP_SEC = 0.5


def _tone(sample_rate: int, seconds: float, hz: float) -> np.ndarray:
    t = np.arange(int(sample_rate * seconds)) / sample_rate
    return (0.1 * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def two_takes(sample_rate: int) -> np.ndarray:
    take = _tone(sample_rate, TAKE_SEC, 440.0)
    return np.concatenate([take, np.zeros(int(sample_rate * GAP_SEC), dtype=np.float32), take])
