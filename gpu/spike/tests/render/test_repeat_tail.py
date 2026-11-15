from spike.render.tail.repeat_tail import head_fraction, repeat_tail_of, spoken_text
from spike.story.story_plan import StorySentence
from spike.render.tail.tail_plan import TailSetting, with_tails

REPEAT = TailSetting("repeat", "그래")
TITLE = StorySentence("빨간 모자", "calm", 900)
CHILD = StorySentence("“네 엄마. 걱정하지 마세요.”", "child", 450)
CALM = StorySentence("엄마가 말했어요.", "calm", 450)


def test_a_quoted_line_repeats_its_last_sentence_without_quotes():
    assert repeat_tail_of(CHILD.text) == "걱정하지 마세요."


def test_a_title_without_a_mark_gets_periods_so_a_pause_separates_the_takes():
    title = with_tails([TITLE], REPEAT)[0]

    assert spoken_text(title) == "빨간 모자. 빨간 모자."
    assert head_fraction(title) == 0.5


def test_units_that_do_not_repeat_are_spoken_as_written():
    assert spoken_text(CALM) == CALM.text


def test_the_head_fraction_counts_syllables_of_the_whole_unit():
    child = with_tails([TITLE, CHILD], REPEAT)[1]

    assert head_fraction(child) == 10 / 17
