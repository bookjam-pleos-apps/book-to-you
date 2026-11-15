import numpy as np

from spike.sound.audio import Audio
from spike.clone.scoring.whisper_window import WHISPER_WINDOW_SEC, cleaned_segments, exceeds_whisper_window, join_segments


def _seconds(sec: int, extra_samples: int = 0, rate: int = 24000) -> Audio:
    return Audio(np.zeros(rate * sec + extra_samples, dtype=np.float32), rate)


def test_exactly_the_window_still_fits():
    assert not exceeds_whisper_window(_seconds(WHISPER_WINDOW_SEC))


def test_one_sample_past_the_window_exceeds_it():
    assert exceeds_whisper_window(_seconds(WHISPER_WINDOW_SEC, 1))


def test_segments_join_in_order_with_one_space():
    assert join_segments(["옛날 옛적에", "어부가 살았어요."]) == "옛날 옛적에 어부가 살았어요."


def test_segments_are_trimmed_and_empty_ones_dropped():
    assert cleaned_segments([" 하나 ", "", "  ", "둘"]) == ["하나", "둘"]
