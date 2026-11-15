"""wav 파일을 모노 Audio로 읽는다."""
import io
from pathlib import Path

import soundfile as sf

from spike.sound.audio import Audio, to_mono


def read_audio(path: Path) -> Audio:
    samples, sample_rate = sf.read(path, dtype="float32")
    return to_mono(Audio(samples, sample_rate))


def decode_audio(data: bytes) -> Audio:
    """파일로 내려쓰지 않고 읽는다. 부모 녹음을 장비의 경로에 남기지 않는다."""
    samples, sample_rate = sf.read(io.BytesIO(data), dtype="float32")
    return to_mono(Audio(samples, sample_rate))


def audio_seconds(path: Path) -> float:
    """헤더만 읽어 길이(초)를 잰다. report.json의 durationSec은 0.01초로 반올림돼 있어 누적하면 어긋난다."""
    info = sf.info(path)
    return info.frames / info.samplerate
