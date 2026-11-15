from dataclasses import replace

import pytest

from spike.render.tail.repeat_check import head_share, repeat_suspect
from spike.render.tail.tail_plan import TailSetting, with_tails
from spike.story.story_plan import StorySentence

TITLE = with_tails([StorySentence("개구리 왕자", "calm", 450)], TailSetting("repeat", "그래"))[0]


def test_head_share_is_the_kept_part_of_the_generated_audio():
    assert head_share(1.2, 2.4) == pytest.approx(0.5)
    assert head_share(1.0, 0.0) is None


@pytest.mark.parametrize(("share", "suspect"), [(0.5, False), (0.6, False), (0.75, True), (0.3, True)])
def test_a_head_far_from_the_expected_share_is_suspected(share: float, suspect: bool):
    assert repeat_suspect(TITLE, share) is suspect


def test_units_without_a_repeat_or_a_measured_share_are_not_judged():
    assert repeat_suspect(replace(TITLE, tail=None), 0.9) is None
    assert repeat_suspect(TITLE, None) is None


def test_a_word_tail_has_no_repeat_to_suspect():
    word_title = with_tails([StorySentence("개구리 왕자", "calm", 450)], TailSetting("word", "그래"))[0]

    assert repeat_suspect(word_title, 0.9) is None
