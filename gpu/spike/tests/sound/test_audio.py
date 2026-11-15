import numpy as np

from spike.sound.audio import Audio


def test_duration_counts_frames_not_channels():
    stereo = Audio(np.zeros((36000, 2), dtype=np.float32), 24000)

    assert stereo.duration_sec == 1.5


def test_empty_audio_lasts_zero_seconds():
    assert Audio(np.zeros(0, dtype=np.float32), 24000).duration_sec == 0
