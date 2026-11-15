from pathlib import Path

import numpy as np
import soundfile as sf

from fakes import SAMPLE_RATE, tone
from spike.sound.audio import Audio, to_mono
from spike.sound.audio_io import audio_seconds, read_audio


def test_mono_audio_is_unchanged():
    audio = Audio(tone(), SAMPLE_RATE)
    assert to_mono(audio) is audio


def test_stereo_is_averaged_to_one_channel():
    left, right = tone(level=0.4), tone(level=0.2)
    mono = to_mono(Audio(np.stack([left, right], axis=1), SAMPLE_RATE))
    assert mono.samples.ndim == 1
    assert np.allclose(mono.samples, tone(level=0.3), atol=1e-6)


def test_stereo_wav_is_read_as_mono(tmp_path: Path):
    path = tmp_path / "stereo.wav"
    sf.write(path, np.stack([tone(), tone()], axis=1), SAMPLE_RATE)
    audio = read_audio(path)
    assert audio.samples.ndim == 1 and audio.sample_rate == SAMPLE_RATE


def test_audio_seconds_reads_the_exact_length_from_the_header(tmp_path: Path):
    path = tmp_path / "unit.wav"
    sf.write(path, np.zeros(SAMPLE_RATE * 3 // 2 + 7, dtype=np.float32), SAMPLE_RATE)
    assert audio_seconds(path) == (SAMPLE_RATE * 3 // 2 + 7) / SAMPLE_RATE
