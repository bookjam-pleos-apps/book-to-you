import json
import sys
from pathlib import Path

import pytest

from spike.experiments.render import run_export_plan

from spike.story import story_units
from spike.clone.budget import count_syllables
from spike.story.story_document import save_confirmed_story
from spike.story.story_plan import PARAGRAPH_PAUSE_MS, SENTENCE_PAUSE_MS, StorySentence
from spike.render.story_store import load_plan
from spike.story.story_units import (
    UnitLimits,
    group_units,
    load_unit_limits,
    oversize_sentences,
    read_as_conflicts,
    read_as_problems,
    read_styles_as,
    short_units,
    unverified_styles,
)

LIMITS = UnitLimits(max_syllables=6, min_syllables=2)


def _calm(text: str, pause: int = SENTENCE_PAUSE_MS) -> StorySentence:
    return StorySentence(text, "calm", pause)


def test_neighbors_of_the_same_style_join_and_keep_the_last_pause():
    units = group_units([_calm("가나."), _calm("다라.", PARAGRAPH_PAUSE_MS)], LIMITS)
    assert units == [StorySentence("가나. 다라.", "calm", PARAGRAPH_PAUSE_MS)]


def test_different_styles_never_share_a_unit():
    sentences = [_calm("가나."), StorySentence("다라.", "soft", SENTENCE_PAUSE_MS), _calm("마바.")]
    assert group_units(sentences, LIMITS) == sentences


def test_paragraph_pause_is_not_lost():
    sentences = [_calm("가나.", PARAGRAPH_PAUSE_MS), _calm("다라.")]
    assert group_units(sentences, LIMITS) == sentences


def test_units_stay_within_the_limit_and_keep_every_character():
    sentences = [_calm(f"{syllables}.") for syllables in ("가나다", "라마바", "사", "아자차카")]
    units = group_units(sentences, LIMITS)
    assert all(count_syllables(unit.text) <= LIMITS.max_syllables for unit in units)
    assert "".join(unit.text.replace(" ", "") for unit in units) == "".join(item.text for item in sentences)
    assert [unit.text for unit in units] == ["가나다. 라마바.", "사. 아자차카."]


def test_oversize_sentence_is_listed_instead_of_cut():
    assert oversize_sentences([_calm("가나다라마바사.")], LIMITS) == ["7음절: 가나다라마바사."]
    assert oversize_sentences([_calm("가나다.")], LIMITS) == []


def test_short_units_are_only_reported():
    assert short_units([_calm("가.")], LIMITS) == ["1음절: 가."]


def _export(monkeypatch: pytest.MonkeyPatch, *argv: object) -> None:
    monkeypatch.setattr(sys, "argv", ["prog", *map(str, argv)])
    run_export_plan.main()


def _limits_file(folder: Path, maximum: int) -> Path:
    path = folder / "limits.json"
    path.write_text(json.dumps({"maxSyllables": maximum, "minSyllables": 1}), encoding="utf-8")
    return path


def test_limits_come_from_the_setting_file(tmp_path: Path):
    assert load_unit_limits(_limits_file(tmp_path, 120)) == UnitLimits(120, 1)


def test_export_groups_only_when_limits_are_given(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    story = tmp_path / "story.json"
    save_confirmed_story(story, "frog", [_calm("가나."), _calm("다라.", PARAGRAPH_PAUSE_MS)])
    _export(monkeypatch, "--story", story, "--out", tmp_path / "sentences")
    _export(monkeypatch, "--story", story, "--out", tmp_path / "units", "--limits", _limits_file(tmp_path, 6))
    assert len(load_plan(tmp_path / "sentences")) == 2
    assert len(load_plan(tmp_path / "units")) == 1


def test_export_refuses_a_sentence_over_the_limit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    story = tmp_path / "story.json"
    save_confirmed_story(story, "frog", [_calm("가나다.")])
    with pytest.raises(SystemExit):
        _export(monkeypatch, "--story", story, "--out", tmp_path / "plan", "--limits", _limits_file(tmp_path, 2))
    assert not (tmp_path / "plan").exists()


def test_reading_soft_as_calm_lets_neighbors_join():
    sentences = [_calm("가나."), StorySentence("다라.", "soft", SENTENCE_PAUSE_MS)]
    assert group_units(read_styles_as(sentences, {"soft": "calm"}), LIMITS) == [StorySentence("가나. 다라.", "calm", SENTENCE_PAUSE_MS)]


def test_export_reads_soft_as_calm_without_touching_the_story(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    story, plan = tmp_path / "story.json", tmp_path / "plan"
    save_confirmed_story(story, "t", [StorySentence("가나.", "soft", SENTENCE_PAUSE_MS)])
    monkeypatch.setattr(sys, "argv", ["x", "--story", str(story), "--out", str(plan), "--read-as", "soft=calm"])
    run_export_plan.main()
    assert [item.style for item in load_plan(plan)] == ["calm"]
    assert json.loads(story.read_text(encoding="utf-8"))["sentences"][0]["style"] == "soft"


def test_read_as_refuses_unknown_styles_on_either_side():
    assert read_as_problems({"sfot": "calm"}, ("calm", "soft"))
    assert read_as_problems({"soft": "whsiper"}, ("calm", "soft"))
    assert read_as_problems({"soft": "calm"}, ("calm", "soft")) == []


@pytest.fixture
def soft_unverified(monkeypatch: pytest.MonkeyPatch):
    """장치는 다음에 들일 녹음을 위해 남긴다. 지금 목록은 비어 있어 soft로 시험한다."""
    monkeypatch.setattr(story_units, "UNVERIFIED_STYLES", ("soft",))


def test_soft_exports_without_read_as_since_it_was_verified(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    story, plan = tmp_path / "story.json", tmp_path / "plan"
    save_confirmed_story(story, "t", [StorySentence("가나.", "soft", SENTENCE_PAUSE_MS)])
    monkeypatch.setattr(sys, "argv", ["x", "--story", str(story), "--out", str(plan)])
    run_export_plan.main()
    assert [item.style for item in load_plan(plan)] == ["soft"]


@pytest.mark.usefixtures("soft_unverified")
def test_unverified_style_must_be_named_explicitly():
    sentences = [StorySentence("가나.", "soft", SENTENCE_PAUSE_MS)]
    assert unverified_styles(sentences, {}) == ["soft"]
    assert unverified_styles(sentences, {"soft": "calm"}) == []
    assert unverified_styles(sentences, {"soft": "soft"}) == []
    assert unverified_styles([_calm("가나.")], {}) == []


@pytest.mark.usefixtures("soft_unverified")
def test_export_refuses_soft_without_read_as(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    story, plan = tmp_path / "story.json", tmp_path / "plan"
    save_confirmed_story(story, "t", [StorySentence("가나.", "soft", SENTENCE_PAUSE_MS)])
    monkeypatch.setattr(sys, "argv", ["x", "--story", str(story), "--out", str(plan)])
    with pytest.raises(SystemExit):
        run_export_plan.main()
    assert not plan.exists()


@pytest.mark.parametrize("bad", ["sfot=calm", "soft=whsiper", "soft", "soft=calm=x"])
def test_export_refuses_a_bad_read_as(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, bad: str):
    story, plan = tmp_path / "story.json", tmp_path / "plan"
    save_confirmed_story(story, "t", [StorySentence("가나.", "soft", SENTENCE_PAUSE_MS)])
    monkeypatch.setattr(sys, "argv", ["x", "--story", str(story), "--out", str(plan), "--read-as", bad])
    with pytest.raises(SystemExit):
        run_export_plan.main()
    assert not plan.exists()


def test_read_as_refuses_two_targets_for_one_style():
    assert read_as_conflicts([("soft", "calm"), ("soft", "excited")])
    assert read_as_conflicts([("soft", "calm"), ("soft", "calm")]) == []


@pytest.mark.usefixtures("soft_unverified")
def test_unverified_style_cannot_arrive_through_read_as():
    assert unverified_styles([_calm("가나.")], {"calm": "soft"}) == ["soft"]
    assert unverified_styles([_calm("가나.")], {"soft": "soft"}) == []
