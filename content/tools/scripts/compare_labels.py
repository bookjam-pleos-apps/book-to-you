#!/usr/bin/env python3
"""같은 초안에 쓴 두 라벨을 비교한다. 판정용 목록은 어느 쪽이 첫 결과인지 숨긴다.

사용: compare_labels.py <id.draft.json> <첫 labels> <검토 labels> <판정 폴더>
labels.judge.swapped.json은 모든 항목의 A, B를 바꾼 같은 목록이다. 새 컨텍스트의 두 번째 판정자에게 준다.
"""

import json
from collections import Counter
from pathlib import Path

from guyeon_common import (
    abort_on,
    arguments,
    blinded,
    draft_hash,
    file_hash,
    other_sides,
    read_json,
    refuse_existing,
    swapped,
    write_json_atomic,
)
from label_rules import label_problems, label_values

FIELDS = ("style", "speaker", "emotion")
REASON_KEYS = ("excited", "soft", "review")
COPIED = "검토 라벨이 첫 라벨과 같습니다. 첫 결과를 보지 않은 새 컨텍스트에서 다시 만드세요"


def kappa(left: list[str], right: list[str]) -> float | None:
    """한쪽 값만 있으면 우연 일치가 1이라 정의되지 않는다."""
    total = len(left)
    observed = sum(a == b for a, b in zip(left, right)) / total
    left_counts, right_counts = Counter(left), Counter(right)
    chance = sum(left_counts[key] * right_counts[key] for key in left_counts) / (total * total)
    return None if chance == 1 else round((observed - chance) / (1 - chance), 3)


def field_summary(a: list[dict], b: list[dict], field: str) -> dict:
    left, right = [item[field] for item in a], [item[field] for item in b]
    return {"agreement": round(sum(x == y for x, y in zip(left, right)) / len(left), 3), "kappa": kappa(left, right)}


def disagreements(sentences: list[dict], a: list[dict], b: list[dict]) -> list[dict]:
    return [
        {
            "id": f"{index}:{field}",
            "index": index,
            "field": field,
            "text": sentences[index]["text"],
            "first": a[index][field],
            "review": b[index][field],
        }
        for index in range(len(sentences))
        for field in FIELDS
        if a[index][field] != b[index][field]
    ]


def review_overlap(first: dict, review: dict) -> dict:
    left, right = ({item["index"] for item in labels.get("review", [])} for labels in (first, review))
    return {"first": len(left), "review": len(right), "both": len(left & right)}


def _sorted_lists(labels: dict) -> dict:
    def order(item: object) -> str:
        return json.dumps(item, ensure_ascii=False, sort_keys=True)

    return {key: sorted(value, key=order) if isinstance(value, list) else value for key, value in labels.items()}


def _reasons(labels: dict) -> dict[str, list[tuple[object, str]]]:
    return {key: sorted((item.get("index"), str(item.get("reason", ""))) for item in labels.get(key, [])) for key in REASON_KEYS}


def copy_signals(first: dict, review: dict, items: list[dict]) -> tuple[bool, bool]:
    """(복사본인가, 경고할 일치인가). 이유가 하나도 없는 두 라벨은 우연히 같을 수 있어 복사로 보지 않는다."""
    has_reasons = any(reason for pairs in _reasons(first).values() for _, reason in pairs)
    if _sorted_lists(first) == _sorted_lists(review):
        return has_reasons, not has_reasons
    if items:
        return False, False
    same_reasons = _reasons(first) == _reasons(review)
    return same_reasons and has_reasons, not same_reasons


def _refuse_copied_review(first: dict, review: dict, items: list[dict]) -> None:
    copied, suspicious = copy_signals(first, review, items)
    if copied:
        raise SystemExit(COPIED)
    if suspicious:
        print("경고: 불일치가 0건입니다. 검토 라벨이 첫 결과를 보지 않고 만들어졌는지 확인하세요")


def _write_judging(out: Path, items: list[dict], seed: str, paths: tuple[Path, Path]) -> None:
    shown, key = blinded(items, seed)
    write_json_atomic(out / "labels.judge.json", {"items": shown})
    write_json_atomic(out / "labels.judge.swapped.json", {"items": swapped(shown)})
    hashes = {"firstHash": file_hash(paths[0]), "reviewHash": file_hash(paths[1])}
    write_json_atomic(out / "private" / "labels.key.json", {**hashes, "firstSide": key, "swappedFirstSide": other_sides(key)})


def _print_summary(sentences: list[dict], items: list[dict], summaries: dict, reviews: dict, judge_path: Path) -> None:
    styles = sum(item["field"] == "style" for item in items)
    print(f"{len(sentences)}문장, 불일치 {len(items)}건(문장 {len({item['index'] for item in items})}개), style {styles}건")
    print(summaries)
    print(f"검수 요청: {reviews} → {judge_path}")


def main() -> int:
    draft, first_path, review_path, out = (
        Path(item) for item in arguments(4, "compare_labels.py <id.draft.json> <첫 labels> <검토 labels> <판정 폴더>")
    )
    refuse_existing(out / "labels.judge.json")
    refuse_existing(out / "labels.judge.swapped.json")
    sentences = read_json(draft)["sentences"]
    first, review = read_json(first_path), read_json(review_path)
    abort_on(
        [
            f"{name}: {problem}"
            for name, labels in (("첫 라벨", first), ("검토 라벨", review))
            for problem in label_problems(labels, sentences)
        ]
    )
    a, b = label_values(first, len(sentences)), label_values(review, len(sentences))
    items = disagreements(sentences, a, b)
    _refuse_copied_review(first, review, items)
    _write_judging(out, items, draft_hash(sentences), (first_path, review_path))
    summaries = {field: field_summary(a, b, field) for field in FIELDS}
    _print_summary(sentences, items, summaries, review_overlap(first, review), out / "labels.judge.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
