#!/usr/bin/env python3
"""라벨을 기본 초안에 합쳐 구연 초안을 만든다. confirmedStyle은 사람의 몫이라 비워 둔다.

사용: apply_labels.py <id.draft.json> <labels.json> <새 초안.draft.json>
"""

from pathlib import Path

from guyeon_common import STYLES, abort_on, arguments, audible, read_json, refuse_existing, role_of, write_json_atomic
from label_rules import label_problems, label_values


def labeled_line(line: dict, value: dict, reason: str | None, review: str | None) -> dict:
    notes = [
        *line["notes"],
        *([f"{value['style']} 이유: {reason}"] if reason else []),
        *([f"검수 요청: {review}"] if review else []),
    ]
    return {
        **line,
        "role": role_of(line["text"]),
        "speaker": value["speaker"],
        "emotion": value["emotion"],
        "suggestedStyle": value["style"],
        "probabilities": {},
        "notes": notes,
        "confirmedStyle": None,
    }


def switch_count(styles: list[str]) -> int:
    return sum(left != right for left, right in zip(styles, styles[1:]))


def _refuse_unusable(document: dict, labels: dict) -> None:
    if document.get("tagger") == "guyeon-skill":
        raise SystemExit("이미 라벨을 합친 초안입니다. run_tag_story가 만든 기본 초안을 주세요")
    abort_on(label_problems(labels, document["sentences"]))
    if labels.get("plantedForTest"):
        raise SystemExit("오류를 심은 시험용 라벨입니다. 실제 초안에 쓰지 않습니다")
    if labels.get("relabel"):
        raise SystemExit(f"다시 라벨링할 문장이 남아 있습니다: {labels['relabel']}. 확인한 뒤 relabel을 비우세요")


def merged_document(document: dict, labels: dict) -> dict:
    sentences = document["sentences"]
    values = label_values(labels, len(sentences))
    reasons = {item["index"]: item["reason"] for style in ("excited", "soft") for item in labels.get(style, [])}
    reviews = {item["index"]: item["reason"] for item in labels.get("review", [])}
    lines = [labeled_line(line, values[i], reasons.get(i), reviews.get(i)) for i, line in enumerate(sentences)]
    extras = {key: labels.get(key, []) for key in ("cast", "scenes", "decisions", "judged")}
    return {**document, **extras, "draftHash": labels["draftHash"], "tagger": "guyeon-skill", "sentences": lines}


def _print_summary(lines: list[dict], out: Path) -> None:
    styles = [line["suggestedStyle"] for line in lines]
    print(f"{len(lines)}문장: " + ", ".join(f"{style} {styles.count(style)}" for style in STYLES))
    print(f"참조 전환: 표시 기준 {switch_count(styles)}회, 지금 렌더 기준 {switch_count([audible(style) for style in styles])}회")
    roles = [line["role"] for line in lines]
    print(f"역할: 서술 {roles.count('narration')}, 대사 {roles.count('dialogue')}, 혼합 {roles.count('mixed')}")
    print(f"저장: {out}")


def main() -> int:
    draft_path, labels_path, out = (
        Path(item) for item in arguments(3, "apply_labels.py <id.draft.json> <labels.json> <새 초안.draft.json>")
    )
    if not out.name.endswith(".draft.json"):
        raise SystemExit(f"파일 이름은 .draft.json으로 끝나야 합니다: {out}")
    refuse_existing(out)
    document, labels = read_json(draft_path), read_json(labels_path)
    _refuse_unusable(document, labels)
    merged = merged_document(document, labels)
    write_json_atomic(out, merged)
    _print_summary(merged["sentences"], out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
