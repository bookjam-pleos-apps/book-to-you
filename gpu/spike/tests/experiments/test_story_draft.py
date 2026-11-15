import json
import sys
from pathlib import Path

import pytest

from spike import run_confirm_story, run_tag_story
from spike.experiments.render import run_export_plan
from spike.story.story_document import load_confirmed_story, load_draft, save_draft
from spike.story.story_draft import (
    LONG_LEAD_NOTE,
    LONG_TAIL_NOTE,
    DraftSentence,
    Suggestion,
    build_draft,
    confirmation_problems,
    confirmed_sentences,
    draft_line,
    suggest_by_rule,
)
from spike.story.story_plan import StorySentence
from spike.story.story_split import SentenceSlot, split_story
from spike.render.story_store import REPORT_NAME, load_plan, save_plan

BODY = "토토가 왔어요.\n\n\"와, 정말이야!\" 토토가 말했어요."
LONG_TAIL = "“가!” 하고, 소리쳤으나 토끼는 못 들은 척하고 그냥 뛰어서 굴로 들어가 버렸습니다."


def _reviewed(body: str, style: str = "calm") -> list[DraftSentence]:
    return [
        DraftSentence(slot.text, slot.pause_after_ms, Suggestion("calm"), confirmed_style=style)
        for slot in split_story(body)
    ]


def _run(monkeypatch: pytest.MonkeyPatch, entry, *argv: object) -> None:
    monkeypatch.setattr(sys, "argv", ["prog", *map(str, argv)])
    entry.main()


def test_rule_recognizes_straight_quoted_dialogue():
    slots = [SentenceSlot('"와, 정말이야!" 토토가 말했어요.', 450)]
    assert suggest_by_rule(slots, 0).style == "excited"


def test_draft_starts_unconfirmed_and_uses_the_injected_tagger():
    draft = build_draft(split_story(BODY), lambda _slots, index: Suggestion("excited", {"excited": index / 10}))
    assert [line.confirmed_style for line in draft] == [None, None]
    assert [line.suggestion.probabilities["excited"] for line in draft] == [0.0, 0.1]


def test_long_narration_after_dialogue_is_noted_for_review():
    draft = build_draft(split_story(f"{LONG_TAIL}\n\n“가!” 하고 물었어요."), suggest_by_rule)
    assert [line.notes for line in draft] == [(LONG_TAIL_NOTE,), ()]


def test_long_narration_before_dialogue_is_noted_for_review():
    lead = "아주 깊은 나무숲 속에서 어느덧 해가 뉘엿뉘엿 지고 있었는데, “왜 우십니까?”"
    draft = build_draft(split_story(f"{lead}\n\n그는, “왜?”"), suggest_by_rule)
    assert [line.notes for line in draft] == [(LONG_LEAD_NOTE,), ()]


def test_confirmation_refuses_every_kind_of_unreviewed_or_changed_line():
    slots = split_story("하나. 둘. 셋. 넷.")
    draft = [
        DraftSentence("하나.", slots[0].pause_after_ms, Suggestion("calm")),
        DraftSentence("두울.", slots[1].pause_after_ms, Suggestion("calm"), confirmed_style="calm"),
        DraftSentence("셋.", 1, Suggestion("calm"), confirmed_style="calm"),
        DraftSentence("넷.", slots[3].pause_after_ms, Suggestion("calm"), confirmed_style="whisper"),
    ]
    problems = confirmation_problems(draft, slots)
    assert [problem.split("번")[0] for problem in problems] == ["0", "1", "2", "3"]


def test_confirmation_refuses_a_different_sentence_count():
    assert "문장 수" in confirmation_problems([], split_story("하나."))[0]


def test_reviewed_draft_passes_and_keeps_the_contract():
    draft = _reviewed(BODY, "excited")
    assert confirmation_problems(draft, split_story(BODY)) == []
    assert confirmed_sentences(draft)[0] == StorySentence("토토가 왔어요.", "excited", 900)


def test_draft_is_written_so_the_render_plan_cannot_read_it(tmp_path: Path):
    path = tmp_path / "frog.draft.json"
    save_draft(path, "frog", "rule", _reviewed(BODY))
    assert "style" not in json.loads(path.read_text(encoding="utf-8"))["sentences"][0]
    assert load_draft(path) == ("frog", _reviewed(BODY))


def test_draft_needs_its_own_file_name(tmp_path: Path):
    with pytest.raises(ValueError, match="draft.json"):
        save_draft(tmp_path / REPORT_NAME, "frog", "rule", [])


def test_existing_draft_keeps_its_review(tmp_path: Path):
    path = tmp_path / "frog.draft.json"
    save_draft(path, "frog", "rule", [])
    with pytest.raises(FileExistsError):
        save_draft(path, "frog", "rule", [])


def test_saved_plan_round_trips_through_load_plan(tmp_path: Path):
    sentences = [StorySentence("하나.", "soft", 450), StorySentence("둘.", "calm", 900)]
    save_plan(tmp_path, sentences)
    assert load_plan(tmp_path) == sentences
    with pytest.raises(FileExistsError):
        save_plan(tmp_path, sentences)


def _review_all(path: Path) -> None:
    document = json.loads(path.read_text(encoding="utf-8"))
    document["sentences"] = [{**line, "confirmedStyle": line["suggestedStyle"]} for line in document["sentences"]]
    document["reviewRecord"] = {"reviewer": "운영", "reviewedAt": "2026-11-13T00:00:00+00:00"}
    path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")


def test_manuscript_reaches_the_render_plan_only_after_review(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    body, draft = tmp_path / "story.txt", tmp_path / "frog.draft.json"
    story, plan = tmp_path / "stories" / "frog.json", tmp_path / "plan"
    body.write_text(BODY, encoding="utf-8")
    _run(monkeypatch, run_tag_story, "--body", body, "--id", "frog", "--out", draft)
    with pytest.raises(SystemExit):
        _run(monkeypatch, run_confirm_story, "--body", body, "--draft", draft, "--title", "개구리 왕자", "--out", story)
    assert not story.exists()
    _review_all(draft)
    _run(monkeypatch, run_confirm_story, "--body", body, "--draft", draft, "--title", "개구리 왕자", "--out", story)
    _run(monkeypatch, run_export_plan, "--story", story, "--out", plan)
    assert [item.style for item in load_plan(plan)] == ["calm", "excited"]
    assert load_plan(plan) == load_confirmed_story(story)


def test_confirmed_story_keeps_speaker_and_emotion_but_the_plan_does_not(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    body, draft, story, plan = tmp_path / "s.txt", tmp_path / "s.draft.json", tmp_path / "s.json", tmp_path / "plan"
    body.write_text("“싫어!” 하고 토끼가 말했어요.", encoding="utf-8")
    _run(monkeypatch, run_tag_story, "--body", body, "--id", "s", "--out", draft)
    document = json.loads(draft.read_text(encoding="utf-8"))
    document["sentences"] = [{**line, "confirmedStyle": "calm", "speaker": "토끼", "emotion": "anger"} for line in document["sentences"]]
    document["reviewRecord"] = {"reviewer": "운영"}
    draft.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    _run(monkeypatch, run_confirm_story, "--body", body, "--draft", draft, "--title", "개구리 왕자", "--out", story)
    document = json.loads(story.read_text(encoding="utf-8"))
    saved = document["sentences"][0]
    assert document["title"] == "개구리 왕자"
    assert (saved["speaker"], saved["emotion"]) == ("토끼", "anger")
    _run(monkeypatch, run_export_plan, "--story", story, "--out", plan)
    assert sorted(json.loads((plan / REPORT_NAME).read_text(encoding="utf-8"))[0]) == ["pauseAfterMs", "style", "text"]
    assert load_confirmed_story(story) == load_plan(plan)


def test_a_draft_without_annotations_keeps_its_format():
    line = draft_line(0, DraftSentence("하나.", 450, Suggestion("calm")))
    assert "speaker" not in line and "emotion" not in line


def test_tagging_refuses_an_existing_draft_before_calling_the_tagger(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    body, draft = tmp_path / "s.txt", tmp_path / "s.draft.json"
    body.write_text("하나.", encoding="utf-8")
    draft.write_text("{}", encoding="utf-8")

    def tagger_must_not_run():
        raise AssertionError("태거를 불렀습니다")

    monkeypatch.setitem(run_tag_story.TAGGERS, "rule", tagger_must_not_run)
    with pytest.raises(FileExistsError):
        _run(monkeypatch, run_tag_story, "--body", body, "--id", "s", "--out", draft)


def test_confirm_warns_when_a_paragraph_opens_with_a_short_shout(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    body, draft, story = tmp_path / "s.txt", tmp_path / "s.draft.json", tmp_path / "s.json"
    body.write_text("어부가 바다로 갔어요.\n\n여보! 정말 황제가 된 거요?", encoding="utf-8")
    _run(monkeypatch, run_tag_story, "--body", body, "--id", "s", "--out", draft)
    _review_all(draft)
    capsys.readouterr()
    _run(monkeypatch, run_confirm_story, "--body", body, "--draft", draft, "--title", "어부", "--out", story)
    assert "첫머리가 짧은 외침" in capsys.readouterr().out
    assert story.exists()
