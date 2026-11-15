import numpy as np

from fakes import SAMPLE_RATE, silence, tone
from spike.sound.audio import Audio
from spike.sound.phonation import is_whisper, reference_pitch_hz, voiced_ratio

SPEECH_FRAMES = 200


def _speech_with_pause() -> Audio:
    """앞 0.5초 무음, 뒤 2초 말소리. F0 배열 250프레임 중 뒤 200프레임이 말소리 구간이다."""
    return Audio(np.concatenate([silence(0.5), tone(sec=2.0)]), SAMPLE_RATE)


def _f0(speech: np.ndarray) -> np.ndarray:
    return np.concatenate([np.full(50, np.nan), speech])


def test_pitched_speech_is_fully_voiced_because_pauses_are_not_counted():
    ratio = voiced_ratio(_f0(np.full(SPEECH_FRAMES, 200.0)), _speech_with_pause(), 200.0)
    assert ratio == 1.0 and not is_whisper(ratio)


def test_whisper_has_no_pitch_in_the_speakers_band():
    ratio = voiced_ratio(_f0(np.full(SPEECH_FRAMES, np.nan)), _speech_with_pause(), 200.0)
    assert ratio == 0.0 and is_whisper(ratio)


def test_spurious_pitch_near_the_tracker_ceiling_does_not_count_as_voiced():
    spurious = np.where(np.arange(SPEECH_FRAMES) % 4 == 0, 550.0, np.nan)
    assert is_whisper(voiced_ratio(_f0(spurious), _speech_with_pause(), 200.0))


def test_reference_pitch_is_the_median_of_pitched_frames():
    assert reference_pitch_hz(np.concatenate([np.full(30, 200.0), np.full(10, np.nan)])) == 200.0


def test_too_little_pitch_or_speech_cannot_be_judged():
    assert reference_pitch_hz(np.full(5, 200.0)) is None
    assert voiced_ratio(np.full(10, 200.0), Audio(silence(0.1), SAMPLE_RATE), 200.0) is None
    assert is_whisper(None) is None
