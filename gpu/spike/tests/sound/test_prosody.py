import numpy as np
import pytest

from fakes import SAMPLE_RATE, gliding_f0, silence, tone
from spike.sound.audio import Audio
from spike.sound.prosody import energy_spread_db, f0_range_semitones, median_semitones


def test_median_semitones_ignore_unpitched_frames():
    f0 = np.array([440.0] * 30 + [np.nan] * 30)
    assert median_semitones(f0) == pytest.approx(12 * np.log2(440.0))


def test_median_semitones_need_enough_pitched_frames():
    assert median_semitones(np.full(100, np.nan)) is None


def test_one_octave_glide_spans_eighty_percent_of_twelve_semitones():
    assert f0_range_semitones(gliding_f0(200, 400)) == pytest.approx(9.6, abs=0.1)


def test_range_is_the_same_for_low_and_high_voices():
    assert f0_range_semitones(gliding_f0(100, 150)) == pytest.approx(f0_range_semitones(gliding_f0(250, 375)))


def test_unvoiced_frames_are_ignored():
    f0 = np.concatenate([gliding_f0(200, 400), np.full(300, np.nan)])
    assert f0_range_semitones(f0) == pytest.approx(9.6, abs=0.1)


def test_one_octave_error_does_not_widen_the_range():
    f0 = np.concatenate([np.full(99, 200.0), [800.0]])
    assert f0_range_semitones(f0) == pytest.approx(0.0, abs=0.01)


def test_too_little_voicing_has_no_range():
    f0 = np.concatenate([gliding_f0(200, 400, frames=10), np.full(200, np.nan)])
    assert f0_range_semitones(f0) is None


def test_steady_speech_has_less_energy_spread_than_accented_speech():
    steady = Audio(tone(0.5, sec=1.0), SAMPLE_RATE)
    accented = Audio(np.concatenate([silence(0.3), tone(0.5, sec=0.5), tone(0.1, sec=0.5), silence(0.3)]), SAMPLE_RATE)
    assert energy_spread_db(steady) == pytest.approx(0.0, abs=0.1)
    assert energy_spread_db(accented) > 5.0


def test_silence_has_no_energy_spread():
    assert energy_spread_db(Audio(silence(1.0), SAMPLE_RATE)) is None
