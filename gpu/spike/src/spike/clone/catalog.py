import json
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import Literal

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
SPEAKER_ID = re.compile(r"[a-z0-9_]+")
# 첫 클립이 그 화자의 동일인 기준(앵커)이 되고, 발성 검사의 기준 F0도 이 스타일에서 잰다.
ANCHOR_STYLE = "calm"

Phonation = Literal["voiced", "unvoiced"]
PHONATIONS: dict[str, Phonation] = {"voiced": "voiced", "unvoiced": "unvoiced"}


@dataclass(frozen=True)
class ReferenceScript:
    """identity_threshold는 calm 앵커 대비 동일인 게이트 임계값이다. None이면 실행 기본값(0.6)을 쓴다.

    실제 사람도 신나거나 속삭이면 앵커와의 ECAPA 코사인이 크게 떨어진다. EARS 56~75세 여성 3명 미리보기에서
    regular 대비 extasy 0.45~0.76, whisper 0.28~0.62, 타인 -0.04~0.15였다. 실녹음 기준선으로 다시 맞춘다.

    phonation은 발성 검사가 기대하는 발성이다. None이면 판정하지 않는다. excited처럼 음높이가 앵커 대역을
    벗어날 수 있는 스타일은 비워 둔다.
    """
    style: str
    direction: str
    instruct: str
    text: str
    identity_threshold: float | None = None
    phonation: Phonation | None = None


@dataclass(frozen=True)
class EvalSentence:
    id: str
    style: str
    tags: tuple[str, ...]
    ceiling: bool
    text: str


SpeakerSource = Literal["preset", "design", "recorded"]


@dataclass(frozen=True)
class Speaker:
    """scripts는 이 화자의 녹음이 제품 대본과 다른 대본을 읽은 style만 적는다."""
    id: str
    source: SpeakerSource
    preset: str | None
    description: str | None
    note: str
    scripts: Mapping[str, str] = field(hash=False)


def _read(name: str, data_dir: Path) -> dict:
    return json.loads((data_dir / name).read_text(encoding="utf-8"))


def load_reference_scripts(data_dir: Path = DATA_DIR) -> list[ReferenceScript]:
    raw = _read("reference-scripts.json", data_dir)["scripts"]
    return [_reference_script(item) for item in raw]


def _reference_script(item: dict) -> ReferenceScript:
    return ReferenceScript(
        style=item["style"],
        direction=item["direction"],
        instruct=item["instruct"],
        text=item["text"],
        identity_threshold=item.get("identityThreshold"),
        phonation=_phonation(item.get("phonation")),
    )


def _phonation(value: object) -> Phonation | None:
    """오타가 나면 발성 검사가 조용히 빠지므로 읽을 때 막는다."""
    if value is None:
        return None
    if str(value) not in PHONATIONS:
        raise ValueError(f"unknown phonation: {value}")
    return PHONATIONS[str(value)]


def load_eval_sentences(data_dir: Path = DATA_DIR) -> list[EvalSentence]:
    raw = _read("test-sentences.json", data_dir)["sentences"]
    return [EvalSentence(**{**item, "tags": tuple(item["tags"])}) for item in raw]


def _to_speaker(item: dict) -> Speaker:
    """화자 id는 경로에 그대로 들어가므로 폴더 밖으로 나갈 수 없는 형식만 허용한다."""
    if not SPEAKER_ID.fullmatch(item["id"]):
        raise ValueError(f"invalid speaker id: {item['id']!r}")
    return Speaker(**{**item, "scripts": MappingProxyType(item.get("scripts", {}))})


def load_speakers(data_dir: Path = DATA_DIR) -> list[Speaker]:
    raw = _read("speakers.json", data_dir)["speakers"]
    return [_to_speaker(item) for item in raw]


def select_speakers(speakers: list[Speaker], ids: list[str] | None) -> list[Speaker]:
    if not ids:
        return [s for s in speakers if s.source != "recorded"]
    unknown = set(ids) - {s.id for s in speakers}
    if unknown:
        raise KeyError(f"unknown speakers: {sorted(unknown)}")
    return [s for s in speakers if s.id in ids]


def script_for(style: str, scripts: list[ReferenceScript]) -> ReferenceScript:
    match = next((s for s in scripts if s.style == style), None)
    if match is None:
        raise KeyError(f"unknown style: {style}")
    return match


def reference_text(style: str, scripts: list[ReferenceScript], speaker_scripts: Mapping[str, str]) -> str:
    """녹음이 실제로 읽은 대본이다. ICL은 정확한 ref_text가 필수라 어긋나면 오류 없이 품질만 떨어진다."""
    return speaker_scripts[style] if style in speaker_scripts else script_for(style, scripts).text


def instruct_for(style: str, scripts: list[ReferenceScript]) -> str:
    return script_for(style, scripts).instruct


def identity_threshold_for(style: str, scripts: list[ReferenceScript]) -> float | None:
    return script_for(style, scripts).identity_threshold


def ordered_for_anchor(scripts: list[ReferenceScript]) -> list[ReferenceScript]:
    """calm을 맨 앞에 둔다. 첫 클립이 그 화자의 동일인 기준(앵커)이 된다."""
    return sorted(scripts, key=lambda s: s.style != ANCHOR_STYLE)
