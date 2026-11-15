"""Qwen2.5-VL 답(주인공 박스 JSON)을 정규화된 박스로 읽는다. 모델 호출은 하지 않는다."""
import json
import re
from dataclasses import dataclass

from spike.cover.cover_crop import NormRect

VLM_GRID = 28
JSON_ARRAY = re.compile(r"\[.*\]", re.DOTALL)


@dataclass(frozen=True)
class Subject:
    label: str
    box: NormRect


def grid_size(width: int, height: int) -> tuple[int, int]:
    """Qwen2.5-VL은 28px 격자로 맞춘 입력의 픽셀 좌표로 답한다. 미리 이 크기로 맞춰 넘기면 좌표를 이 크기로 나누면 된다."""
    return tuple(max(VLM_GRID, round(side / VLM_GRID) * VLM_GRID) for side in (width, height))


def _unit(value: float) -> float:
    return round(max(0.0, min(value, 1.0)), 4)


def _subject(item: object, grid: tuple[int, int]) -> Subject | None:
    if not isinstance(item, dict):
        return None
    bbox = item.get("bbox_2d")
    if not isinstance(bbox, list) or len(bbox) != 4 or not all(isinstance(v, (int, float)) for v in bbox):
        return None
    x1, y1, x2, y2 = bbox
    box = NormRect(_unit(x1 / grid[0]), _unit(y1 / grid[1]), _unit(x2 / grid[0]), _unit(y2 / grid[1]))
    if box.left >= box.right or box.top >= box.bottom:
        return None
    return Subject(str(item.get("label", "")), box)


def parse_subjects(answer: str, grid: tuple[int, int]) -> list[Subject]:
    """답에서 첫 JSON 배열을 읽는다(코드 펜스나 앞뒤 말이 붙어도 된다). 모양이 틀린 항목은 버린다."""
    match = JSON_ARRAY.search(answer)
    if match is None:
        return []
    try:
        items = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(items, list):
        return []
    return [subject for subject in (_subject(item, grid) for item in items) if subject is not None]
