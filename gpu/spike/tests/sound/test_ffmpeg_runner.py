import shutil
import subprocess
from pathlib import Path

import pytest

from spike.sound.ffmpeg_runner import ffmpeg_command, run_ffmpeg


def test_command_is_an_argument_list_ending_in_destination():
    command = ffmpeg_command(["-i", "a.wav"], Path("/out/b.wav"))
    assert command[0] == "ffmpeg" and command[-1] == "/out/b.wav"


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_failed_run_leaves_no_output(tmp_path: Path):
    dst = tmp_path / "out.wav"
    with pytest.raises(subprocess.CalledProcessError):
        run_ffmpeg(["-i", str(tmp_path / "missing.wav")], dst)
    assert list(tmp_path.iterdir()) == []
