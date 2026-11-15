import numpy as np

from spike.sound.audio import Audio
from spike.sound.audio_gaps import KEEP_INTO_GAP_SEC
from spike.render.tail.repeat_cut import cut_repeat

RATE = 24000


def tone(hz: float, seconds: float) -> np.ndarray:
    t = np.arange(int(RATE * seconds)) / RATE
    return (0.1 * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(RATE * seconds), dtype=np.float32)


def last_sentence() -> np.ndarray:
    """끝 음절 앞에 짧은 막힘 무음이 있는 문장. '기뻐'의 'ㅃ' 앞처럼 진짜 경계보다 앞에 쉼이 하나 더 생긴다."""
    return np.concatenate([tone(600, 0.4), silence(0.12), tone(900, 0.4)])


def two_takes() -> tuple[Audio, float]:
    head = np.concatenate([tone(300, 0.5), tone(450, 0.5), silence(0.4), last_sentence()])
    samples = np.concatenate([head, silence(0.5), last_sentence()])
    return Audio(samples, RATE), len(head) / RATE


def test_cuts_at_the_pause_before_the_repeat_not_at_a_closure_inside_the_last_word():
    audio, head_sec = two_takes()

    head = cut_repeat(audio, 0.62)

    assert head is not None
    assert abs(head.duration_sec - (head_sec + KEEP_INTO_GAP_SEC)) < 0.02


def test_audio_without_a_pause_cannot_be_cut():
    assert cut_repeat(Audio(tone(440, 2.0), RATE), 0.5) is None

