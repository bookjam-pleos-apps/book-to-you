import json

import pytest

from spike.render.tail.repeat_tail import spoken_text
from spike.story.story_plan import SpokenTail, StorySentence
from spike.render.tail.tail_plan import TailSetting, tail_word, with_tails
from spike.render.tail.tail_setting import load_tail_setting, tail_setting_from

TITLE = StorySentence("빨간 모자", "calm", 900)
CHILD = StorySentence("“네 엄마. 걱정하지 마세요.”", "child", 450)
CALM = StorySentence("엄마가 말했어요.", "calm", 450)
SILENT = StorySentence("“…….”", "child", 450)


@pytest.mark.parametrize("mode", ["repeat", "word"])
def test_only_the_title_and_child_units_get_a_tail(mode):
    units = with_tails([TITLE, CALM, CHILD], TailSetting(mode, "그래"))

    assert [None if unit.tail is None else unit.tail.kind for unit in units] == [mode, None, mode]


def test_no_tail_mode_leaves_every_unit_as_written():
    units = with_tails([TITLE, CALM, CHILD], TailSetting("none", "그래"))

    assert [spoken_text(unit) for unit in units] == [TITLE.text, CALM.text, CHILD.text]


def test_a_word_tail_follows_the_unit_after_a_full_stop():
    title, _, child = with_tails([TITLE, CALM, CHILD], TailSetting("word", "그래"))

    assert spoken_text(title) == "빨간 모자. 그래."
    assert spoken_text(child) == "“네 엄마. 걱정하지 마세요.” 그래."
    assert tail_word(child.tail) == "그래"


def test_a_line_without_syllables_to_repeat_is_left_alone_but_can_take_a_word():
    assert with_tails([TITLE, SILENT], TailSetting("repeat", "그래"))[1].tail is None
    assert with_tails([TITLE, SILENT], TailSetting("word", "그래"))[1].tail == SpokenTail("그래.", "word")


def test_the_product_default_is_the_listened_word_tail():
    """exp_tail_word 블라인드 청취(말끝 잘림 0, repeat와 같은 수준)로 바꿨다. 다시 바꾸려면 청취 기록이 먼저다."""
    assert load_tail_setting() == TailSetting("word", "그래")


@pytest.mark.parametrize("raw", [{"mode": "twice", "word": "그래"}, {"mode": "word", "word": " "}])
def test_a_tail_setting_that_cannot_be_followed_is_refused(raw):
    with pytest.raises(ValueError):
        tail_setting_from(raw)


def test_the_tail_setting_file_is_read_from_data(tmp_path):
    (tmp_path / "render-tail.json").write_text(json.dumps({"mode": "word", "word": "응"}), encoding="utf-8")

    assert load_tail_setting(tmp_path) == TailSetting("word", "응")
