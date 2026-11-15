import io
import json
import sys

import numpy as np
import pytest
import soundfile as sf

from fakes import SAMPLE_RATE, TONE_HZ, silence, tone
from spike.sound.audio import Audio
from spike.sound.clip_measure import ClipMeasure, clip_measure_document, measure_clip
from spike.sound.prosody import SEMITONES_PER_OCTAVE
from spike.clone.reference.reference_check import speech_rate
from spike.run_voice_measure import main

TONE_SEMITONES = SEMITONES_PER_OCTAVE * np.log2(TONE_HZ)


def _recording(speech_sec: float = 2.0) -> Audio:
    return Audio(np.concatenate([silence(1.0), tone(level=0.5, sec=speech_sec), silence(1.0)]), SAMPLE_RATE)


def _steady_pitch(seconds: float = 2.0) -> np.ndarray:
    return np.full(int(seconds * 100), float(TONE_HZ))


def test_voiced_seconds_leave_out_the_silence_around_the_reading():
    assert measure_clip(_recording(), _steady_pitch()).voiced_seconds == pytest.approx(2.0, rel=0.02)


def test_syllables_over_voiced_seconds_is_the_reference_check_speech_rate():
    audio = _recording()

    assert 10 / measure_clip(audio, _steady_pitch()).voiced_seconds == speech_rate(audio, syllables=10)


def test_a_clip_without_pitch_reports_no_semitones():
    assert measure_clip(_recording(), np.full(200, np.nan)).median_semitones is None


def test_the_document_uses_the_names_the_api_reads():
    assert clip_measure_document(ClipMeasure(2.5, 93.4)) == {"voicedSeconds": 2.5, "medianSemitones": 93.4}
    assert clip_measure_document(ClipMeasure(0.0, None)) == {"voicedSeconds": 0.0, "medianSemitones": None}


def _stdin(data: bytes) -> io.TextIOWrapper:
    return io.TextIOWrapper(io.BytesIO(data))


def _wav(audio: Audio) -> bytes:
    buffer = io.BytesIO()
    sf.write(buffer, audio.samples, audio.sample_rate, format="WAV")
    return buffer.getvalue()


def test_the_cli_measures_the_recording_on_stdin_with_the_reference_check_tracker(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    monkeypatch.setattr(sys, "stdin", _stdin(_wav(_recording())))

    main()

    measured = json.loads(capsys.readouterr().out)
    assert measured["voicedSeconds"] == pytest.approx(2.0, rel=0.02)
    assert measured["medianSemitones"] == pytest.approx(TONE_SEMITONES, abs=0.2)


def test_the_cli_writes_nothing_when_the_audio_cannot_be_read(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    monkeypatch.setattr(sys, "stdin", _stdin(b""))

    with pytest.raises(Exception):
        main()

    assert capsys.readouterr().out == ""
