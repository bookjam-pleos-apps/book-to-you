#!/usr/bin/env python3
"""라벨 작성자에게 줄 문장 목록을 만든다. 규칙 태거의 제안은 빼고, 라벨에 적을 draftHash를 넣는다.

사용: make_label_sheet.py <id.draft.json> <id.sheet.json>
"""

from pathlib import Path

from guyeon_common import arguments, draft_hash, read_json, role_of, syllables, write_json_atomic


def sheet_line(line: dict) -> dict:
    text = line["text"]
    return {
        "index": line["index"],
        "text": text,
        "pauseMs": line["pauseMs"],
        "role": role_of(text),
        "syllables": syllables(text),
        "notes": line["notes"],
    }


def main() -> int:
    draft_path, out = (Path(item) for item in arguments(2, "make_label_sheet.py <id.draft.json> <id.sheet.json>"))
    document = read_json(draft_path)
    sentences = document["sentences"]
    if document.get("tagger") == "guyeon-skill":
        raise SystemExit("라벨을 합치기 전의 기본 초안을 주세요")
    write_json_atomic(
        out, {"id": document["id"], "draftHash": draft_hash(sentences), "sentences": [sheet_line(line) for line in sentences]}
    )
    print(f"{len(sentences)}문장, draftHash {draft_hash(sentences)} → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
