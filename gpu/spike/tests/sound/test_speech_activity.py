import numpy as np
import pytest

from fakes import SAMPLE_RATE, silence, tone
from spike.sound.audio import Audio
from spike.sound.speech_activity import longest_gap_sec, voiced_duration


def _audio(*parts: np.ndarray) -> Audio:
    return Audio(np.concatenate(parts), SAMPLE_RATE)


def _with_room_noise(audio: Audio, level: float) -> Audio:
    noise = np.random.default_rng(0).normal(0, level, len(audio.samples)).astype(np.float32)
    return Audio(audio.samples + noise, SAMPLE_RATE)


def test_room_noise_is_not_counted_as_speech():
    noisy = _with_room_noise(_audio(silence(0.5), tone(sec=1.0), silence(0.7)), level=0.01)
    assert voiced_duration(noisy) == pytest.approx(1.0, abs=0.05)


def test_quiet_recording_still_has_speech():
    quiet = _audio(silence(0.5), tone(level=0.002, sec=1.0), silence(0.5))
    assert voiced_duration(quiet) == pytest.approx(1.0, abs=0.03)


def test_longest_gap_ignores_lead_in_and_tail():
    audio = _audio(silence(1.0), tone(sec=0.5), silence(1.2), tone(sec=0.5), silence(0.3), tone(sec=0.5), silence(2.0))
    assert longest_gap_sec(audio) == pytest.approx(1.2, abs=0.03)


def test_clip_without_pause_has_no_gap():
    audio = _audio(tone(sec=1.0))
    assert voiced_duration(audio) == pytest.approx(1.0, abs=0.03)
    assert longest_gap_sec(audio) == 0.0


def test_silent_clip_has_no_gap():
    assert longest_gap_sec(_audio(silence(1.0))) == 0.0
