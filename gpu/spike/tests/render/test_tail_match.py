import pytest

from spike.render.tail.tail_match import HeardHead, first_heard, kept_ending, said_word

TEXT = "“네 엄마. 걱정하지 마세요.”"


@pytest.mark.parametrize(("whole", "said"), [("네 엄마 걱정하지 마세요 그래.", True), ("네, 엄마. 걱정하지 마세요.", False), ("그래요", False)])
def test_the_whole_take_must_end_with_the_word(whole, said):
    assert said_word(whole, "그래") is said


@pytest.mark.parametrize(("head", "kept"), [
    ("네, 엄마. 걱정하지 마세요.", True),
    ("네 엄마 걱정하지 마세", False),
    ("네 엄마 걱정하지 마세요 그", False),
    ("", False),
])
def test_a_head_must_end_with_the_last_letters_of_the_line(head, kept):
    assert kept_ending(head, TEXT) is kept


def test_the_latest_candidate_that_keeps_the_ending_is_chosen():
    whole = "네 엄마 걱정하지 마세요 그래"

    assert first_heard([whole, "걱정하지 마세요 그", "걱정하지 마세요."], "그래", TEXT) == HeardHead(1, "걱정하지 마세요.")
    assert first_heard([whole, "걱정하지 마세요", "걱정하지 마"], "그래", TEXT) == HeardHead(0, "걱정하지 마세요")
    assert first_heard([whole, "걱정하지 마"], "그래", TEXT) is None


def test_a_take_without_the_word_is_not_cut_at_all():
    assert first_heard(["네 엄마 걱정하지 마세요", "네 엄마 걱정하지 마세요"], "그래", TEXT) is None
    assert first_heard([], "그래", TEXT) is None
