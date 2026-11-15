import sys
from pathlib import Path

import pytest

from spike.experiments.render import run_export_plan
from spike.story.story_document import save_confirmed_story
from spike.story.story_plan import PARAGRAPH_PAUSE_MS, SENTENCE_PAUSE_MS, StorySentence
from spike.story.story_units import units_at_fixed_boundaries
from spike.story.unit_openings import opening_shout, shouting_openings


def _line(text: str, style: str = "calm", pause: int = SENTENCE_PAUSE_MS) -> StorySentence:
    return StorySentence(text, style, pause)


@pytest.mark.parametrize(
    ("text", "shout"),
    [
        ("“왕자야! 마법에 걸린 왕자야!”", "왕자야"),
        ("영차, 영차! 빨간 모자가 커다란 돌멩이들을 주워왔어요.", "영차, 영차"),
        ("“여보! 정말 황제가 된 거요?”", "여보"),
        ("여보！ 정말이오？", "여보"),
    ],
)
def test_the_three_heard_failures_are_flagged(text: str, shout: str):
    assert opening_shout(text) == shout


@pytest.mark.parametrize(
    "text",
    [
        "“여보, 정말 황제가 된 거요?”",
        "빨간 모자가 영차, 영차! 커다란 돌멩이들을 주워왔어요.",
        "“왕자야, 마법에 걸린 왕자야,”",
        "“뭐야? 빈손이잖아!”",
        "어부의 아내가 버럭 소리를 질렀어요!",
        "",
    ],
)
def test_fixes_that_passed_listening_and_long_exclamations_are_not_flagged(text: str):
    assert opening_shout(text) is None


def test_only_the_start_of_a_unit_counts():
    units = [_line("어부가 말했어요. 여보! 정말이오?"), _line("여보! 정말이오?", "deep")]
    assert shouting_openings(units) == ["deep: 여보! 정말이오?"]


def test_excited_units_may_open_with_a_shout():
    assert shouting_openings([_line("“흥! 이것만으론 행복할 수 없어.”", "excited")]) == []


def test_fixed_boundaries_are_paragraphs_and_style_changes():
    sentences = [
        _line("바다에 갔어요."),
        _line("영차, 영차!"),
        _line("그물을 던졌어요.", pause=PARAGRAPH_PAUSE_MS),
        _line("영차, 영차! 다시 당겼어요."),
        _line("“왕자야!”", "deep"),
    ]
    starts = [unit.text for unit in units_at_fixed_boundaries(sentences)]
    assert starts == ["바다에 갔어요. 영차, 영차! 그물을 던졌어요.", "영차, 영차! 다시 당겼어요.", "“왕자야!”"]
    assert len(shouting_openings(units_at_fixed_boundaries(sentences))) == 2


def test_export_warns_but_still_writes_the_plan(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    story, plan = tmp_path / "story.json", tmp_path / "plan"
    save_confirmed_story(story, "t", [_line("“여보! 정말 황제가 된 거요?”", "deep")])
    monkeypatch.setattr(sys, "argv", ["x", "--story", str(story), "--out", str(plan)])
    run_export_plan.main()
    assert "첫머리가 짧은 외침" in capsys.readouterr().out
    assert plan.exists()
