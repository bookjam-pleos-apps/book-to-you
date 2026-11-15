"""비교 실험 정의. 각 실험은 기본값에서 달라지는 점만 적는다."""
import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from spike.clone.catalog import DATA_DIR
from spike.clone.layout import Condition

StylePairs = tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class Experiment:
    id: str
    engine: str
    model: str
    non_streaming: bool
    x_vector_only: bool
    style_map: StylePairs
    sentence_styles: tuple[str, ...] | None
    conditions: tuple[Condition, ...]
    seed: int
    note: str
    explicit_only: bool = False

    def reference_style(self, sentence_style: str) -> str:
        return dict(self.style_map).get(sentence_style, sentence_style)

    def includes(self, sentence_style: str) -> bool:
        """비교 실험은 baseline과 결과가 달라지는 문장만 생성한다."""
        return self.sentence_styles is None or sentence_style in self.sentence_styles


def _optional_tuple(value: list[str] | None) -> tuple[str, ...] | None:
    if value is None:
        return None
    return tuple(value)


def _to_experiment(raw: dict) -> Experiment:
    return Experiment(
        id=raw["id"],
        engine=raw["engine"],
        model=raw["model"],
        non_streaming=raw["nonStreaming"],
        x_vector_only=raw["xVectorOnly"],
        style_map=tuple(sorted(raw["styleMap"].items())),
        sentence_styles=_optional_tuple(raw["sentenceStyles"]),
        conditions=tuple(raw["conditions"]),
        seed=raw["seed"],
        note=raw.get("note", ""),
        explicit_only=raw.get("explicitOnly", False),
    )


def load_experiments(data_dir: Path = DATA_DIR) -> list[Experiment]:
    raw = json.loads((data_dir / "experiments.json").read_text(encoding="utf-8"))
    return [_to_experiment({**raw["defaults"], **item}) for item in raw["experiments"]]


def select(experiments: list[Experiment], ids: list[str] | None) -> list[Experiment]:
    if not ids:
        return [e for e in experiments if not e.explicit_only]
    unknown = set(ids) - {e.id for e in experiments}
    if unknown:
        raise KeyError(f"unknown experiments: {sorted(unknown)}")
    return [e for e in experiments if e.id in ids]


def unknown_engines(experiments: Iterable[Experiment], known: Iterable[str]) -> list[str]:
    return sorted({e.engine for e in experiments} - set(known))
