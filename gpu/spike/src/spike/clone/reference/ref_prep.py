"""클론 참조 전처리: 24kHz mono, 앞뒤 무음 제거, 라우드니스 정규화, 끝에 0.5초 무음(#341 참조 대본 누출 완화)."""
import hashlib
from collections.abc import Callable
from pathlib import Path

from spike.sound.ffmpeg_runner import run_ffmpeg
from spike.clone.layout import OUTPUTS_DIR, RECORDINGS_DIR, Condition, prepared_reference_path, reference_path

PrepareReference = Callable[[Path, Path], None]

SAMPLE_RATE = 24000
TAIL_PAD_SEC = 0.5

_TRIM_LEADING = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
FILTERS = ",".join([
    _TRIM_LEADING,
    "areverse", _TRIM_LEADING, "areverse",
    "loudnorm=I=-20:TP=-2:LRA=11",
    f"apad=pad_dur={TAIL_PAD_SEC}",
])
PREP_VERSION = hashlib.sha256(f"{FILTERS}|{SAMPLE_RATE}".encode()).hexdigest()[:8]


def build_args(src: Path) -> list[str]:
    return ["-i", str(src), "-af", FILTERS, "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le"]


def prepare_reference(src: Path, dst: Path) -> None:
    if dst.exists():
        return
    run_ffmpeg(build_args(src), dst)


def prepared_speaker_reference(
    speaker: str,
    condition: Condition,
    style: str,
    prepare: PrepareReference = prepare_reference,
) -> Path:
    prepared = prepared_reference_path(OUTPUTS_DIR, PREP_VERSION, speaker, condition, style)
    prepared.parent.mkdir(parents=True, exist_ok=True)
    prepare(reference_path(RECORDINGS_DIR, speaker, condition, style), prepared)
    return prepared
