#!/usr/bin/env python3
"""사람의 판정을 반영해 confirmedStyle을 채우고 주석을 따로 저장한다. 사람이 승인한 뒤에만 실행한다.

사용: finalize_draft.py <최종 초안.draft.json> <검수 초안.draft.json> --reviewer 이름 --answers 답.json [--set 12=calm --set 57-63=excited]
답.json은 {"<kind>:<from>-<to>": "<사람의 답>"}이다. 같은 kind와 범위의 행이 또 있으면 판정표 순서대로 두 번째부터 "#2", "#3"을 붙인다.
판정표(decision_candidates)의 모든 행에 답이 있어야 한다.
인물표, 장면 지도, 문장 역할은 검수 초안 옆의 <id>.annotations.json에 쓴다. 문장별 speaker와 emotion의 기준은 run_confirm_story의 확정본이다.
"""

import argparse
from datetime import datetime, timezone
from pathlib import Path

from decision_candidates import candidate_table
from guyeon_common import SENTENCE_STYLES, abort_on, cast_styles, changes_sound, read_json, refuse_existing, write_json_atomic
from review_answers import answer_problems, read_answers

ANNOTATION_KEYS = ("index", "text", "role")


def parse_override(raw: str, count: int) -> dict[int, str]:
    span, _, style = raw.partition("=")
    if style not in SENTENCE_STYLES:
        raise SystemExit(f"--set의 값은 {', '.join(SENTENCE_STYLES)} 중 하나입니다. 인물 녹음(deep, child)은 cast에서 정합니다: {raw}")
    start, _, end = span.partition("-")
    if not start.isdigit() or (end and not end.isdigit()) or int(end or start) < int(start):
        raise SystemExit(f"--set 형식은 12=calm 또는 57-63=excited입니다: {raw}")
    if int(end or start) >= count:
        raise SystemExit(f"없는 문장 번호입니다: {raw}")
    return {index: style for index in range(int(start), int(end or start) + 1)}


def merged_overrides(raws: list[str], count: int) -> dict[int, str]:
    pairs = [pair for raw in raws for pair in parse_override(raw, count).items()]
    chosen = {index: {style for other, style in pairs if other == index} for index, _ in pairs}
    abort_on([f"{index}번에 서로 다른 값을 줬습니다" for index, styles in sorted(chosen.items()) if len(styles) > 1])
    return dict(pairs)


def undecided(document: dict, overrides: dict[int, str]) -> list[str]:
    return [
        f"{item['index']}번: 사람 판정이 남아 있습니다. --set으로 정하세요"
        for item in document.get("decisions", [])
        if changes_sound(item) and item["index"] not in overrides
    ]


def cast_breaks(document: dict, overrides: dict[int, str]) -> list[str]:
    """인물마다 녹음이 하나여야 같은 인물이 한 사람처럼 들린다(청취로 확인). 문장 하나만 바꾸면 그 인물이 두 목소리가 된다."""
    fixed = cast_styles(document.get("cast", []))
    speakers = {line["index"]: line.get("speaker") for line in document["sentences"]}
    return [
        f"{index}번: {speakers[index]}의 녹음은 cast에서 {fixed[speakers[index]]}입니다. 인물 녹음을 바꾸려면 라벨의 cast를 고치세요"
        for index, style in sorted(overrides.items())
        if speakers.get(index) in fixed and fixed[speakers[index]] != style
    ]


def annotations(document: dict) -> dict:
    lines = [{key: line[key] for key in ANNOTATION_KEYS} for line in document["sentences"]]
    return {
        "id": document["id"],
        "draftHash": document.get("draftHash"),
        "cast": document.get("cast", []),
        "scenes": document.get("scenes", []),
        "sentences": lines,
    }


def reviewed_document(document: dict, overrides: dict[int, str], reviewer: str, answers: dict[str, str]) -> dict:
    lines = [{**line, "confirmedStyle": overrides.get(line["index"], line["suggestedStyle"])} for line in document["sentences"]]
    record = {
        "reviewer": reviewer,
        "reviewedAt": datetime.now(timezone.utc).isoformat(),
        "overrides": {str(key): value for key, value in sorted(overrides.items())},
        "answers": answers,
        "answeredRows": len(answers),
    }
    return {**document, "sentences": lines, "reviewRecord": record}


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("draft", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--answers", type=Path, required=True)
    parser.add_argument("--set", action="append", default=[], dest="overrides")
    args = parser.parse_args()
    if not args.out.name.endswith(".draft.json"):
        raise SystemExit(f"파일 이름은 .draft.json으로 끝나야 합니다: {args.out}")
    if not args.reviewer.strip():
        raise SystemExit("--reviewer가 비어 있습니다")
    return args


def main() -> int:
    args = _arguments()
    refuse_existing(args.out)
    document = read_json(args.draft)
    if document.get("tagger") != "guyeon-skill" or "reviewRecord" in document:
        raise SystemExit("apply_labels가 만든, 아직 검수하지 않은 구연 초안을 주세요")
    notes_path = args.out.parent / f"{Path(document['id']).name}.annotations.json"
    refuse_existing(notes_path)
    overrides = merged_overrides(args.overrides, len(document["sentences"]))
    answers = read_answers(args.answers)
    unanswered = answer_problems(candidate_table(document)["rows"], answers)
    abort_on([*undecided(document, overrides), *cast_breaks(document, overrides), *unanswered])
    reviewed = reviewed_document(document, overrides, args.reviewer, answers)
    write_json_atomic(args.out, reviewed)
    write_json_atomic(notes_path, annotations(document))
    changed = sum(line["suggestedStyle"] != line["confirmedStyle"] for line in reviewed["sentences"])
    print(f"{len(reviewed['sentences'])}문장 확정 준비, 사람이 바꾼 문장 {changed}개 → {args.out}")
    print(f"주석 저장: {notes_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
