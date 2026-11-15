"""확정은 사람 검수 기록이 있는 초안만 받고, 확정본에 검수 기록을 남긴다."""
import json
import sys
from pathlib import Path

import pytest

from spike import run_confirm_story, run_tag_story
from spike.story.story_review_gate import confirmed_review, review_problems

BODY = "토토가 왔어요."


def _run(monkeypatch: pytest.MonkeyPatch, entry, *argv: object) -> None:
    monkeypatch.setattr(sys, "argv", ["prog", *map(str, argv)])
    entry.main()


def _reviewed_draft(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, record: dict | None) -> tuple[Path, Path]:
    body, draft = tmp_path / "s.txt", tmp_path / "s.draft.json"
    body.write_text(BODY, encoding="utf-8")
    _run(monkeypatch, run_tag_story, "--body", body, "--id", "s", "--out", draft)
    document = json.loads(draft.read_text(encoding="utf-8"))
    document["sentences"] = [{**line, "confirmedStyle": "calm"} for line in document["sentences"]]
    document |= {} if record is None else {"reviewRecord": record}
    draft.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    return body, draft


def test_a_draft_without_a_review_record_cannot_be_confirmed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    body, draft = _reviewed_draft(tmp_path, monkeypatch, None)
    with pytest.raises(SystemExit):
        _run(monkeypatch, run_confirm_story, "--body", body, "--draft", draft, "--title", "토토", "--out", tmp_path / "s.json")
    assert not (tmp_path / "s.json").exists()


def test_the_confirmed_story_keeps_who_reviewed_it(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    record = {"reviewer": "운영", "reviewedAt": "2026-11-13T00:00:00+00:00", "answers": {"결말:0-0": "네"}, "answeredRows": 1}
    body, draft = _reviewed_draft(tmp_path, monkeypatch, record)
    _run(monkeypatch, run_confirm_story, "--body", body, "--draft", draft, "--title", "토토", "--out", tmp_path / "s.json")
    story = json.loads((tmp_path / "s.json").read_text(encoding="utf-8"))
    assert story["review"] == {"reviewer": "운영", "reviewedAt": "2026-11-13T00:00:00+00:00", "answeredRows": 1}


def test_an_old_record_without_answers_passes_and_a_blank_reviewer_does_not():
    assert review_problems({"reviewer": "운영", "reviewedAt": "t", "overrides": {}}) == []
    assert confirmed_review({"reviewer": "운영", "reviewedAt": "t", "overrides": {}}) == {"reviewer": "운영", "reviewedAt": "t"}
    assert review_problems({"reviewer": " "}) != []
    assert review_problems(None) != []
