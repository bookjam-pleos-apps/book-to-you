#!/usr/bin/env python3
"""문장이 바뀐 초안으로 라벨을 옮긴다. 원문이 같은 문장만 옮긴다. 바뀌거나 되풀이되는 문장은 relabel에 올려 확인을 강제한다.

relabel의 previousIndex는 1:1로 대응될 때만 있다. None이면 옛 초안을 직접 보고 정한다.
사용: rebase_labels.py <옛 초안> <옛 labels> <새 초안> <새 labels>
"""

from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

from guyeon_common import arguments, draft_hash, read_json, refuse_existing, write_json_atomic
from label_rules import label_values


def _opcodes(old: list[str], new: list[str]) -> list[tuple[str, int, int, int, int]]:
    return SequenceMatcher(None, old, new, autojunk=False).get_opcodes()


def exact_map(opcodes: list) -> dict[int, int]:
    return {i1 + k: j1 + k for tag, i1, i2, j1, _ in opcodes if tag == "equal" for k in range(i2 - i1)}


def paired_map(opcodes: list) -> dict[int, int]:
    """글자가 바뀐 문장은 앞뒤 개수가 같을 때만 대응시킨다. 그렇지 않으면 삭제된 이웃의 값을 잘못 안내한다."""
    same_size = [code for code in opcodes if code[0] in ("equal", "replace") and code[2] - code[1] == code[4] - code[3]]
    return {i1 + k: j1 + k for _, i1, i2, j1, _ in same_size for k in range(i2 - i1)}


def nearest_map(opcodes: list, count: int) -> dict[int, int]:
    last = max(0, count - 1)
    return {i1 + offset: min(j1 + min(offset, max(0, j2 - j1 - 1)), last) for _, i1, i2, j1, j2 in opcodes for offset in range(i2 - i1)}


def deleted_indexes(opcodes: list) -> set[int]:
    return {i for tag, i1, i2, _, _ in opcodes if tag == "delete" for i in range(i1, i2)}


def moved(entries: list[dict], mapping: dict[int, int], skipped: set[int]) -> list[dict]:
    kept = [{**item, "index": mapping[item["index"]]} for item in entries if item["index"] in mapping]
    return [item for item in kept if item["index"] not in skipped]


def rebased_scenes(scenes: list[dict], nearest: dict[int, int], count: int) -> list[dict]:
    starts = sorted({nearest[scene["from"]]: scene["summary"] for scene in reversed(scenes) if scene["from"] in nearest}.items())
    if not starts:
        return []
    fronts = [0, *[start for start, _ in starts[1:]]]
    ends = [*[front - 1 for front in fronts[1:]], count - 1]
    return [{"from": front, "to": end, "summary": summary} for front, end, (_, summary) in zip(fronts, ends, starts)]


def relabel_entries(changed: list[int], paired: dict[int, int], values: list[dict]) -> list[dict]:
    previous = {new: old for old, new in paired.items()}
    return [
        {
            "index": index,
            "previousIndex": previous.get(index),
            "previousStyle": values[previous[index]]["style"] if index in previous else None,
        }
        for index in changed
    ]


def moved_decisions(decisions: list[dict], paired: dict[int, int], new_texts: list[str]) -> list[dict]:
    return [{**item, "text": new_texts[item["index"]]} for item in moved(decisions, paired, set())]


def lost_decisions(
    decisions: list[dict], paired: dict[int, int], deleted: set[int], nearest: dict[int, int], values: list[dict]
) -> list[dict]:
    """옮길 곳을 못 찾은 사람 판정을 조용히 버리지 않는다. 문장이 삭제됐으면 판정할 것도 없다."""
    unplaced = [item for item in decisions if item["index"] not in paired and item["index"] not in deleted]
    return [
        {
            "index": nearest[item["index"]],
            "previousIndex": item["index"],
            "previousStyle": values[item["index"]]["style"],
            "lostDecision": item["text"],
        }
        for item in unplaced
    ]


def changed_indexes(old_texts: list[str], new_texts: list[str], exact: dict[int, int]) -> list[int]:
    old_counts, new_counts = Counter(old_texts), Counter(new_texts)
    repeated = {i for i, text in enumerate(new_texts) if old_counts[text] > 1 or new_counts[text] > 1}
    return sorted((set(range(len(new_texts))) - set(exact.values())) | repeated)


def rebased_labels(labels: dict, old_texts: list[str], new: list[dict]) -> dict:
    new_texts = [line["text"] for line in new]
    opcodes = _opcodes(old_texts, new_texts)
    exact, paired, nearest = exact_map(opcodes), paired_map(opcodes), nearest_map(opcodes, len(new))
    changed = changed_indexes(old_texts, new_texts, exact)
    values = label_values(labels, len(old_texts))
    decisions = labels.get("decisions", [])
    return {
        **labels,
        **{key: moved(labels.get(key, []), exact, set(changed)) for key in ("excited", "soft", "annotations")},
        "decisions": moved_decisions(decisions, paired, new_texts),
        "review": moved(labels.get("review", []), paired, set()),
        "judged": sorted(exact[i] for i in labels.get("judged", []) if i in exact),
        "scenes": rebased_scenes(labels.get("scenes", []), nearest, len(new)),
        "draftHash": draft_hash(new),
        "relabel": [
            *relabel_entries(changed, paired, values),
            *lost_decisions(decisions, paired, deleted_indexes(opcodes), nearest, values),
        ],
    }


def main() -> int:
    old_draft, old_labels, new_draft, out = (
        Path(item) for item in arguments(4, "rebase_labels.py <옛 초안> <옛 labels> <새 초안> <새 labels>")
    )
    refuse_existing(out)
    old, new = read_json(old_draft)["sentences"], read_json(new_draft)["sentences"]
    labels = read_json(old_labels)
    if labels.get("draftHash") != draft_hash(old):
        raise SystemExit("옛 라벨이 옛 초안에 쓴 것이 아닙니다")
    rebased = rebased_labels(labels, [line["text"] for line in old], new)
    write_json_atomic(out, rebased)
    print(f"다시 볼 항목 {[item['index'] for item in rebased['relabel']]}, 장면 {len(rebased['scenes'])}개. 장면 지도를 확인하세요 → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
