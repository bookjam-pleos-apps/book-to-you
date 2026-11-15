"""ffmpeg 실행의 단일 경계. 셸 없이 인자 배열로 실행하고, 출력은 원자적으로 쓴다."""
import subprocess
from collections.abc import Sequence
from pathlib import Path

from spike.sound.atomic import atomic_path

FFMPEG_PREFIX = ("ffmpeg", "-y", "-loglevel", "error")
FFMPEG_TIMEOUT_SEC = 60


def ffmpeg_command(args: Sequence[str], dst: Path) -> list[str]:
    return [*FFMPEG_PREFIX, *args, str(dst)]


def run_ffmpeg(args: Sequence[str], dst: Path) -> None:
    with atomic_path(dst) as tmp:
        subprocess.run(ffmpeg_command(args, tmp), check=True, timeout=FFMPEG_TIMEOUT_SEC)


def decode_mono_wav(src: Path, dst: Path) -> Path:
    """soundfile이 못 읽는 녹음(m4a, webm)을 모노 wav로 푼다."""
    run_ffmpeg(["-i", str(src), "-ac", "1"], dst)
    return dst
