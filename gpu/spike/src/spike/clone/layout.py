from collections.abc import Mapping
from pathlib import Path
from types import MappingProxyType
from typing import Literal

Condition = Literal["A", "B", "C"]

# A: 무손실 WAV, B: iOS Safari(AAC), C: Android Chrome(Opus)
CONDITION_EXTENSION: Mapping[Condition, str] = MappingProxyType({"A": "wav", "B": "m4a", "C": "webm"})

RECORDINGS_DIR = Path(__file__).resolve().parents[3] / "recordings"
OUTPUTS_DIR = Path(__file__).resolve().parents[3] / "outputs"


def reference_path(root: Path, speaker_id: str, condition: Condition, style: str) -> Path:
    return root / speaker_id / f"{condition}_{style}.{CONDITION_EXTENSION[condition]}"


def ceiling_path(root: Path, speaker_id: str, sentence_id: str) -> Path:
    return root / speaker_id / f"A_ceil_{sentence_id}.wav"


def reference_meta_path(root: Path, speaker_id: str) -> Path:
    return root / speaker_id / "meta.json"


def prepared_reference_path(outputs: Path, prep_version: str, speaker_id: str, condition: Condition, style: str) -> Path:
    """전처리한 참조는 실험과 무관하게 한 번만 만든다. 전처리 설정이 바뀌면 버전 폴더가 바뀌어 새로 만든다."""
    return outputs / "_refs" / prep_version / speaker_id / f"{condition}_{style}.wav"


def clone_output_path(outputs: Path, experiment_id: str, speaker_id: str, condition: Condition, sentence_id: str) -> Path:
    return outputs / experiment_id / speaker_id / condition / f"{sentence_id}.wav"
