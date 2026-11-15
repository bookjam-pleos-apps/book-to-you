import numpy as np
import pytest

from fakes import SAMPLE_RATE, tone
from spike.sound.audio import Audio
from spike.sound.pitch_tracker import PyinPitchTracker


def test_pyin_finds_the_tone_pitch():
    f0 = PyinPitchTracker().track(Audio(tone(0.5, sec=1.0), SAMPLE_RATE))
    assert np.nanmedian(f0) == pytest.approx(220.0, rel=0.02)
