import json
from pathlib import Path

import pytest

from spike.story.story_plan import PARAGRAPH_PAUSE_MS, SENTENCE_PAUSE_MS
from spike.story.story_split import body_warnings, curly_quotes, has_quotes, split_story, stray_line_breaks

GOLDEN = json.loads((Path(__file__).parents[2] / "data" / "split-golden.json").read_text(encoding="utf-8"))


def _glyphs(text: str) -> str:
    return "".join(text.split())


def _case_ids(cases: list[dict]) -> list[str]:
    return [case["id"] for case in cases]


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=_case_ids(GOLDEN["cases"]))
def test_story_splits_as_the_golden_expects(case: dict):
    assert [slot.text for slot in split_story(case["body"])] == case["sentences"]


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=_case_ids(GOLDEN["cases"]))
def test_splitting_never_loses_a_character(case: dict):
    assert _glyphs("".join(slot.text for slot in split_story(case["body"]))) == _glyphs(case["body"])


@pytest.mark.parametrize("case", GOLDEN["rejected"], ids=_case_ids(GOLDEN["rejected"]))
def test_unbalanced_quotes_are_refused(case: dict):
    with pytest.raises(ValueError, match="따옴표"):
        split_story(case["body"])


def test_pauses_are_longer_between_paragraphs():
    assert [slot.pause_after_ms for slot in split_story("하나. 둘.\n\n셋.")] == [
        SENTENCE_PAUSE_MS,
        PARAGRAPH_PAUSE_MS,
        PARAGRAPH_PAUSE_MS,
    ]


def test_joined_sentence_keeps_the_pause_of_its_last_part():
    assert [slot.pause_after_ms for slot in split_story("“와!”\n\n하고 소리쳤어요. 토토가 웃었어요.")] == [
        SENTENCE_PAUSE_MS,
        PARAGRAPH_PAUSE_MS,
    ]


def test_lead_in_before_a_quote_pauses_briefly():
    assert split_story("그러니까,\n\n“안녕!”")[0].pause_after_ms == SENTENCE_PAUSE_MS


def test_empty_body_has_no_sentences():
    assert split_story(" \n\n ") == []


def test_curly_quotes_alternate_open_and_close():
    assert curly_quotes('"가" 하고 "나"') == "“가” 하고 “나”"


def test_has_quotes_tells_a_plain_manuscript_apart():
    assert has_quotes("“안녕!” 토끼가 말했어요.")
    assert not has_quotes("안녕! 토끼가 말했어요.")


def test_body_warnings_name_missing_quotes_and_wrapped_lines():
    assert body_warnings("“좋아!” 토끼가 말했어요.") == []
    warnings = body_warnings("토끼가 숲으로\n갔어요.")
    assert len(warnings) == 2
    assert "따옴표" in warnings[0] and "1곳" in warnings[1]


def test_stray_line_breaks_find_wrapping_but_not_marked_breaks():
    assert stray_line_breaks("토끼가 숲으로\n갔어요. 그리고\n돌아왔어요.") == 2
    assert stray_line_breaks("“좋아!”\n둘은 갔어요.\n\n다음 문단.\n") == 0
    assert stray_line_breaks("끝난 문장이에요.\n다음 문장이에요.") == 0
