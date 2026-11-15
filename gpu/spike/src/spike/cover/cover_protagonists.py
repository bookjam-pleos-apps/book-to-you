"""표지 주인공 고르기(data/cover-protagonists.json). 사람이 고른 점을 품은 인물 박스를 주인공으로 표시한다."""
from dataclasses import dataclass

from spike.cover.cover_crop import NormRect


@dataclass(frozen=True)
class ProtagonistPick:
    who: str
    point: tuple[float, float]


def parse_picks(raw: dict) -> dict[str, ProtagonistPick]:
    return {name: ProtagonistPick(entry["who"], (entry["point"][0], entry["point"][1])) for name, entry in raw["covers"].items()}


def _contains(box: NormRect, point: tuple[float, float]) -> bool:
    return box.left <= point[0] <= box.right and box.top <= point[1] <= box.bottom


def _area(box: NormRect) -> float:
    return (box.right - box.left) * (box.bottom - box.top)


def protagonist_index(boxes: list[NormRect], point: tuple[float, float]) -> int | None:
    """점을 품은 박스가 여럿이면(앞뒤로 겹친 인물) 가장 작은 박스다. 품은 박스가 없으면 None이다."""
    containing = [i for i, box in enumerate(boxes) if _contains(box, point)]
    return min(containing, key=lambda i: _area(boxes[i]), default=None)
