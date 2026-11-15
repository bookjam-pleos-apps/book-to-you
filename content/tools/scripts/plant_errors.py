#!/usr/bin/env python3
"""판정자를 평가하려고 첫 라벨에 틀린 값을 심는다. 시험 전용이며 실제 확정본에는 쓰지 않는다.

재검토자는 심은 값을 보지 않으므로 "검출"은 두 라벨의 일치도를 되풀이할 뿐이다. 쓸모 있는 지표는 판정자가 심은 값을 채택하는 비율이다.
사용: plant_errors.py <draft.json> <labels> <시드> <심은 labels> <심은 목록.json>
"""

import random
from collections.abc import Callable
from functools import reduce
from pathlib import Path

from guyeon_common import NARRATOR, NON_DEFAULT_STYLES, arguments, cast_styles, read_json, refuse_existing, write_json_atomic
from label_rules import label_values

SHARE = 0.1
MINIMUM = 3


def with_style(labels: dict, index: int, style: str) -> dict:
    cleared = {name: [item for item in labels.get(name, []) if item["index"] != index] for name in NON_DEFAULT_STYLES}
    added = {style: [*cleared[style], {"index": index, "reason": "시험용"}]} if style in cleared else {}
    return {**labels, **cleared, **added}


def with_annotation(labels: dict, index: int, speaker: str, emotion: str) -> dict:
    kept = [item for item in labels.get("annotations", []) if item["index"] != index]
    return {**labels, "annotations": [*kept, {"index": index, "speaker": speaker, "emotion": emotion}]}


def _planted(index: int, field: str, original: str, wrong: str, fallback: str) -> dict:
    return {"index": index, "field": field, "original": original, "planted": wrong if original != wrong else fallback}


def _speaker_targets(labels: dict, index: int, current: dict) -> list[str]:
    """심은 화자의 인물 녹음이 그 문장의 style 목록과 어긋나면 compare_labels가 거부하므로 그런 인물은 뺀다."""
    fixed = cast_styles(labels.get("cast", []))
    listed = any(item["index"] == index for name in NON_DEFAULT_STYLES for item in labels.get(name, []))
    names = [item["name"] for item in labels.get("cast", []) if isinstance(item, dict) and "name" in item]
    return [name for name in names if name != current["speaker"] and (not listed or fixed.get(name, current["style"]) == current["style"])]


def _pick(order: list[int], eligible: Callable[[int], bool], taken: set[int], count: int) -> list[int]:
    return [index for index in order if index not in taken and eligible(index)][:count]


def plan_plants(labels: dict, current: list[dict], rng: random.Random) -> list[dict]:
    """인물 녹음을 정한 인물의 대사에 style을 심으면 cast와 어긋나 첫 라벨이 거부되므로 style 후보에서 뺀다."""
    count, fixed = max(MINIMUM, round(len(current) * SHARE)), cast_styles(labels.get("cast", []))
    order = rng.sample(range(len(current)), len(current))
    styled = _pick(order, lambda i: current[i]["speaker"] not in fixed, set(), count)
    emotional = _pick(order, lambda i: True, set(styled), count)
    voiced = _pick(order, lambda i: current[i]["speaker"] != NARRATOR and _speaker_targets(labels, i, current[i]), {*styled, *emotional}, count)
    return [
        *(_planted(i, "style", current[i]["style"], "excited", "soft") for i in styled),
        *(_planted(i, "emotion", current[i]["emotion"], "anger", "joy") for i in emotional),
        *(_planted(i, "speaker", current[i]["speaker"], rng.choice(_speaker_targets(labels, i, current[i])), "") for i in voiced),
    ]


def _apply(labels: dict, current: list[dict], item: dict) -> dict:
    index, line = item["index"], current[item["index"]]
    if item["field"] == "style":
        return with_style(labels, index, item["planted"])
    if item["field"] == "emotion":
        return with_annotation(labels, index, line["speaker"], item["planted"])
    return with_annotation(labels, index, item["planted"], line["emotion"])


def plant(labels: dict, current: list[dict], rng: random.Random) -> tuple[dict, list[dict]]:
    """cast 인물이 둘 미만이면 바꿀 화자가 없어 speaker는 심지 않는다."""
    plants = plan_plants(labels, current, rng)
    result = reduce(lambda result, item: _apply(result, current, item), plants, labels)
    return {**result, "plantedForTest": True}, plants


def main() -> int:
    draft, labels_path, seed, out, planted_out = arguments(5, "plant_errors.py <draft.json> <labels> <시드> <심은 labels> <심은 목록.json>")
    refuse_existing(Path(out))
    sentences = read_json(Path(draft))["sentences"]
    labels = read_json(Path(labels_path))
    result, planted = plant(labels, label_values(labels, len(sentences)), random.Random(int(seed)))
    write_json_atomic(Path(out), result)
    write_json_atomic(Path(planted_out), planted)
    print(f"심은 값 {len(planted)}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
