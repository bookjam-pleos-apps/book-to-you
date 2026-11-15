#!/usr/bin/env python3
"""정답이 있는 동화로 대사 복원과 라벨을 채점한다. 숫자만 내고 합격선은 두지 않는다.

정답은 레포 밖 작업 폴더의 _gold/<id>.gold.txt(곡선 따옴표로 복원한 원문) 또는 확정본 content/stories/<id>.json이다.
정답을 레포에 두지 않는 것은 시험 중인 운영자나 재검토자가 보지 못하게 하려는 것이다.
문장 경계와 라벨 일치율은 분할 결과가 있어야 하므로 확정본 정답에 --labels, --draft를 줄 때만 낸다.
사용: grade_gold.py --strip <gold.txt> <out.txt>
      grade_gold.py <정답> <복원본.txt> [--labels <최종 labels.json> --draft <draft.json>]
"""

import json
import sys
from itertools import accumulate
from pathlib import Path

from check_quotes import QUOTE_MARKS
from compare_restore import glyphs_of, spoken_kinds
from guyeon_common import read_json, split_option, write_text_atomic
from label_rules import label_values

USAGE = "grade_gold.py --strip <gold.txt> <out.txt> | grade_gold.py <정답> <복원본.txt> [--labels <labels.json> --draft <draft.json>]"


def stripped(text: str) -> str:
    return "".join(char for char in text if char not in QUOTE_MARKS)


def _ratio(hits: int, total: int) -> float:
    return round(hits / max(1, total), 3)


def restoration_score(restored: str, gold: str) -> dict:
    """글자 단위 재현율과 정밀도. 따옴표 종류(말, 생각)는 가리지 않는다."""
    if glyphs_of(restored) != glyphs_of(gold):
        raise SystemExit("복원본과 정답의 글자가 다릅니다")
    predicted, expected = spoken_kinds(restored)[0], spoken_kinds(gold)[0]
    both = sum(left is not None and right is not None for left, right in zip(predicted, expected))
    found, wanted = sum(item is not None for item in predicted), sum(item is not None for item in expected)
    return {"spokenRecall": _ratio(both, wanted), "spokenPrecision": _ratio(both, found)}


def spans(sentences: list[dict]) -> list[tuple[int, int]]:
    """문장마다 따옴표와 공백을 뺀 글자 위치의 (시작, 끝)."""
    ends = list(accumulate(len(glyphs_of(line["text"])) for line in sentences))
    return list(zip([0, *ends[:-1]], ends))


def boundary_match(gold: list[dict], draft: list[dict]) -> float:
    """두 분할의 문장 끝 위치 합집합 가운데 겹치는 비율."""
    expected, found = {end for _, end in spans(gold)}, {end for _, end in spans(draft)}
    return _ratio(len(expected & found), len(expected | found))


def label_agreement(gold: list[dict], draft: list[dict], labels: dict) -> dict:
    """경계가 같은 문장끼리만 비교한다. 번호가 밀려도 같은 문장을 맞댄다."""
    at = {span: index for index, span in enumerate(spans(gold))}
    values = label_values(labels, len(draft))
    pairs = [(gold[at[span]], values[index]) for index, span in enumerate(spans(draft)) if span in at]
    return {
        "alignedSentences": len(pairs),
        "styleAgreement": _ratio(sum(truth["style"] == value["style"] for truth, value in pairs), len(pairs)),
        "speakerAgreement": _ratio(sum(truth["speaker"] == value["speaker"] for truth, value in pairs), len(pairs)),
    }


def gold_of(path: Path) -> tuple[str, list[dict] | None]:
    if path.suffix != ".json":
        return path.read_text(encoding="utf-8"), None
    sentences = read_json(path)["sentences"]
    return "\n".join(line["text"] for line in sentences), sentences


def grade(gold_path: Path, restored: str, labels_path: Path | None, draft_path: Path | None) -> dict:
    gold_text, gold_sentences = gold_of(gold_path)
    empty = {"boundaryMatch": None, "alignedSentences": None, "styleAgreement": None, "speakerAgreement": None}
    result = {"gold": gold_path.name, **restoration_score(restored, gold_text), **empty}
    if gold_sentences is None or labels_path is None or draft_path is None:
        return result
    draft = read_json(draft_path)["sentences"]
    return {**result, "boundaryMatch": boundary_match(gold_sentences, draft), **label_agreement(gold_sentences, draft, read_json(labels_path))}


def _options(args: list[str]) -> tuple[list[str], Path | None, Path | None]:
    rest, labels = split_option(args, "--labels", 1)
    rest, draft = split_option(rest, "--draft", 1)
    if len(rest) != 2 or (labels is None) != (draft is None):
        raise SystemExit(f"사용: {USAGE}")
    return rest, Path(labels[0]) if labels else None, Path(draft[0]) if draft else None


def main() -> int:
    args = sys.argv[1:]
    if args[:1] == ["--strip"]:
        if len(args) != 3:
            raise SystemExit(f"사용: {USAGE}")
        write_text_atomic(Path(args[2]), stripped(Path(args[1]).read_text(encoding="utf-8")))
        return 0
    (gold, restored), labels, draft = _options(args)
    print(json.dumps(grade(Path(gold), Path(restored).read_text(encoding="utf-8"), labels, draft), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
