"""낱말 꼬리를 붙여 생성한 단위처럼 들리는 가짜 생성음. 말끝 앞 막힘 무음, 꼬리 앞 쉼, 짧은 꼬리 낱말 순서다."""
import numpy as np

RATE = 24000
HEAD_SEC = 1.32
TAIL_GAP_SEC = 0.3
WORD_SEC = 0.4


def tone(hz: float, seconds: float) -> np.ndarray:
    t = np.arange(int(RATE * seconds)) / RATE
    return (0.1 * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(RATE * seconds), dtype=np.float32)


def head_then_word() -> np.ndarray:
    """앞부분 끝 0.2초 앞에 0.12초 막힘이 있어 그 뒤 소리도 낱말 길이로 보인다(잘못 자를 후보)."""
    head = np.concatenate([tone(300, 1.0), silence(0.12), tone(600, 0.2)])
    return np.concatenate([head, silence(TAIL_GAP_SEC), tone(900, WORD_SEC)])
