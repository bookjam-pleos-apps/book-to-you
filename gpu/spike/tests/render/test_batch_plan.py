import pytest

from spike.render.batch.batch_plan import Batch, plan_batches
from spike.story.story_plan import StorySentence

SHORT, MID, LONG = "가나다라마.", "가나다라마바사아자차.", "가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다."


def _units(*pairs: tuple[str, str]) -> dict[int, StorySentence]:
    return {index: StorySentence(text, style, 450) for index, (style, text) in enumerate(pairs)}


UNITS = _units(("calm", LONG), ("child", SHORT), ("calm", SHORT), ("calm", MID), ("child", LONG), ("calm", MID))


def test_every_pending_unit_is_in_exactly_one_batch():
    batches = plan_batches(UNITS, list(UNITS), 2)

    assert sorted(i for batch in batches for i in batch.units) == sorted(UNITS)


def test_a_batch_holds_one_style_and_at_most_the_batch_size():
    batches = plan_batches(UNITS, list(UNITS), 2)

    assert all(len(batch.units) <= 2 and {UNITS[i].style for i in batch.units} == {batch.style} for batch in batches)


def test_units_of_similar_length_share_a_batch():
    assert plan_batches(UNITS, list(UNITS), 2) == [
        Batch("calm", (2, 3)), Batch("calm", (5, 0)), Batch("child", (1, 4)),
    ]


def test_only_pending_units_are_planned():
    assert plan_batches(UNITS, [4, 0], 8) == [Batch("calm", (0,)), Batch("child", (4,))]


def test_batch_size_one_renders_each_unit_alone():
    assert [batch.units for batch in plan_batches(UNITS, list(UNITS), 1)] == [(2,), (3,), (5,), (0,), (1,), (4,)]


def test_a_batch_size_below_one_is_refused():
    with pytest.raises(ValueError):
        plan_batches(UNITS, [0], 0)
