import json
import shutil
import subprocess
from pathlib import Path

import pytest

from spike.clone.reference.ref_prep import SAMPLE_RATE, TAIL_PAD_SEC, prepare_reference

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")

SPEECH_SEC = 2.0


def _silence_speech_silence(path: Path) -> None:
    """앞 0.7초 무음 + 2초 소리 + 뒤 1초 무음."""
    graph = (
        "anullsrc=r=48000:cl=mono:d=0.7[a];"
        f"sine=frequency=220:sample_rate=48000:duration={SPEECH_SEC}[b];"
        "anullsrc=r=48000:cl=mono:d=1.0[c];"
        "[a][b][c]concat=n=3:v=0:a=1"
    )
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-filter_complex", graph, str(path)], check=True)


def _probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    return {**data["streams"][0], "duration": float(data["format"]["duration"])}


def test_trims_silence_and_pads_tail(tmp_path: Path):
    src, dst = tmp_path / "raw.wav", tmp_path / "ref.wav"
    _silence_speech_silence(src)
    prepare_reference(src, dst)
    info = _probe(dst)
    assert info["duration"] == pytest.approx(SPEECH_SEC + TAIL_PAD_SEC, abs=0.15)
    assert int(info["sample_rate"]) == SAMPLE_RATE and info["channels"] == 1


def test_existing_output_is_left_untouched(tmp_path: Path):
    src, dst = tmp_path / "raw.wav", tmp_path / "ref.wav"
    dst.write_bytes(b"keep")
    prepare_reference(src, dst)
    assert dst.read_bytes() == b"keep"
