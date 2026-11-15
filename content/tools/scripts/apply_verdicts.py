#!/usr/bin/env python3
"""라벨 불일치 판정을 반영해 최종 라벨을 만든다. `사람` 판정은 첫 값을 두고 decisions에 올린다.

verdicts.json: {"items": [{"id": "12:style", "verdict": "A|B|사람", "reason": "..."}]}. 불일치가 없으면 {"items": []}.
사용: apply_verdicts.py <id.draft.json> <첫 labels> <검토 labels> <판정 폴더> <verdicts.json> <최종 labels> [--swapped <verdicts2.json>]
--swapped는 labels.judge.swapped.json을 본 두 번째 판정이다. 두 판정이 다른 쪽을 고른 항목은 `사람`으로 바꾼다.
"""

import sys
from pathlib import Path
from typing import NamedTuple

from guyeon_common import NARRATOR, NON_DEFAULT_STYLES, abort_on, file_hash, read_json, refuse_existing, split_option, write_json_atomic
from label_rules import label_problems, label_values
from verdict_rules import HUMAN, read_verdicts, reconciled, source_of

USAGE = "apply_verdicts.py <id.draft.json> <첫 labels> <검토 labels> <판정 폴더> <verdicts.json> <최종 labels> [--swapped <verdicts2.json>]"


class Judging(NamedTuple):
    items: list[dict]
    verdicts: dict[str, dict]
    first_side: dict[str, str]


def final_values(first: list[dict], review: list[dict], verdicts: dict[str, dict], key: dict[str, str]) -> list[dict]:
    def chosen(index: int, field: str) -> object:
        item = f"{index}:{field}"
        if item not in verdicts:
            return first[index][field]
        side = source_of(verdicts[item]["verdict"], key[item])
        return (first if side == "first" else review)[index][field]

    return [{field: chosen(index, field) for field in ("style", "speaker", "emotion")} for index in range(len(first))]


def _style_entries(style: str, values: list[dict], first: dict, review: dict, verdicts: dict[str, dict]) -> list[dict]:
    """이유가 없는 문장은 두 라벨 모두 cast 녹음으로 같게 읽은 문장이다. 목록에 없어도 cast로 읽히니 넣지 않는다."""
    known = {item["index"]: item["reason"] for labels in (review, first) for item in labels.get(style, [])}
    reasons = {index: known.get(index) or verdicts.get(f"{index}:style", {}).get("reason") for index in range(len(values))}
    return [{"index": index, "reason": reasons[index]} for index, value in enumerate(values) if value["style"] == style and reasons[index]]


def merged_reviews(first: dict, review: dict) -> list[dict]:
    first_items = {item["index"]: item for item in first.get("review", [])}
    extra = [
        {"index": item["index"], "reason": f"(재검토자) {item['reason']}"}
        for item in review.get("review", [])
        if item["index"] not in first_items
    ]
    return sorted([*first_items.values(), *extra], key=lambda item: item["index"])


def _private_key(folder: Path, first_path: Path, review_path: Path) -> dict:
    private = read_json(folder / "private" / "labels.key.json")
    if (private["firstHash"], private["reviewHash"]) != (file_hash(first_path), file_hash(review_path)):
        raise SystemExit("비교한 뒤 라벨이 바뀌었거나 순서가 바뀌었습니다. compare_labels를 새 폴더에 다시 돌리세요")
    return private


def _judged_verdicts(private: dict, path: Path, swapped_path: Path | None) -> dict[str, dict]:
    verdicts = read_verdicts(path, private["firstSide"])
    if swapped_path is None:
        print("바꾼 판정(--swapped) 없이 반영합니다. 자리 편향은 확인하지 않았습니다", file=sys.stderr)
        return verdicts
    if "swappedFirstSide" not in private:
        raise SystemExit("이 판정 폴더에는 A, B를 바꾼 판정 파일이 없습니다. compare_labels를 새 폴더에 다시 돌리세요")
    second_key = private["swappedFirstSide"]
    return reconciled(verdicts, read_verdicts(swapped_path, second_key), private["firstSide"], second_key)


def _paths() -> tuple[list[Path], Path | None]:
    args, swapped = split_option(sys.argv[1:], "--swapped", 1)
    if len(args) != 6:
        raise SystemExit(f"사용: {USAGE}")
    return [Path(item) for item in args], (Path(swapped[0]) if swapped else None)


def _human_decisions(judged: list[dict], verdicts: dict[str, dict], a: list[dict], b: list[dict]) -> list[dict]:
    def decision(item: dict) -> dict:
        index, field = item["index"], item["field"]
        return {
            "index": index,
            "field": field,
            "text": item["text"],
            "first": a[index][field],
            "review": b[index][field],
            "reason": verdicts[item["id"]]["reason"],
        }

    return [decision(item) for item in judged if verdicts[item["id"]]["verdict"] == HUMAN]


def _cast_in_use(first: dict, review: dict, values: list[dict]) -> list[dict]:
    first_names = {item["name"] for item in first.get("cast", [])}
    named = [*first.get("cast", []), *[item for item in review.get("cast", []) if item["name"] not in first_names]]
    used = {value["speaker"] for value in values}
    return [item for item in named if item["name"] in used]


def judged_values(first: dict, review: dict, judging: Judging, count: int) -> list[dict]:
    return final_values(label_values(first, count), label_values(review, count), judging.verdicts, judging.first_side)


def final_labels(first: dict, review: dict, judging: Judging, values: list[dict]) -> dict:
    a, b = label_values(first, len(values)), label_values(review, len(values))
    return {
        **first,
        **{style: _style_entries(style, values, first, review, judging.verdicts) for style in NON_DEFAULT_STYLES},
        "cast": _cast_in_use(first, review, values),
        "annotations": [
            {"index": i, "speaker": v["speaker"], "emotion": v["emotion"]}
            for i, v in enumerate(values)
            if (v["speaker"], v["emotion"]) != (NARRATOR, "neutral")
        ],
        "review": merged_reviews(first, review),
        "decisions": _human_decisions(judging.items, judging.verdicts, a, b),
        "judged": sorted({item["index"] for item in judging.items if item["field"] == "style"}),
    }


def cast_overrides(values: list[dict], final: dict) -> list[str]:
    """excited, soft 목록에 없는 문장은 최종 cast의 녹음으로 읽힌다. cast는 첫 라벨이 우선이라 검토 쪽 녹음을 고른 판정이 조용히 덮인다."""
    heard = label_values(final, len(values))
    return [
        f"{index}번: 판정은 {chosen['style']}인데 인물 녹음(cast) 때문에 {read['style']}로 읽힙니다. "
        "두 라벨의 cast를 맞추거나 이 문장을 사람 판정으로 넘기세요"
        for index, (chosen, read) in enumerate(zip(values, heard))
        if chosen["style"] != read["style"]
    ]


def main() -> int:
    (draft, first_path, review_path, folder, verdict_path, out), swapped_path = _paths()
    refuse_existing(out)
    sentences = read_json(draft)["sentences"]
    first, review = read_json(first_path), read_json(review_path)
    private = _private_key(folder, first_path, review_path)
    verdicts = _judged_verdicts(private, verdict_path, swapped_path)
    abort_on([f"검토 라벨: {problem}" for problem in label_problems(review, sentences)])
    judged = read_json(folder / "labels.judge.json")["items"]
    judging = Judging(judged, verdicts, private["firstSide"])
    values = judged_values(first, review, judging, len(sentences))
    final = final_labels(first, review, judging, values)
    abort_on(label_problems(final, sentences))
    abort_on(cast_overrides(values, final))
    write_json_atomic(out, final)
    decisions = final["decisions"]
    print(f"최종 라벨 저장: {out}. 사람에게 넘긴 판정 {len(decisions)}건 (style {sum(item['field'] == 'style' for item in decisions)}건)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
