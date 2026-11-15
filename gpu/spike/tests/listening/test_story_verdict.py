import pytest

from spike.listening.story_verdict import RenderValidity, marked_boundary, picks_of_chain, story_verdict

STARTS = [0.0, 20.0, 40.0, 60.0]
PASSING = {"continuity_picks": 5, "monotony_picks": 2, "likeness_picks": 3, "boundaries": {2, 15, 16}, "repeats": 0, "playable": True}


def _verdict(**changes) -> bool:
    return story_verdict(**{**PASSING, **changes}).passed


def test_lowest_passing_values_pass():
    assert _verdict()


@pytest.mark.parametrize(
    "changes",
    [
        {"continuity_picks": 4},
        {"monotony_picks": 1},
        {"likeness_picks": 2},
        {"boundaries": {1, 2, 3, 4}},
        {"boundaries": {13, 14, 15}},
        {"repeats": 1},
        {"playable": False},
    ],
)
def test_any_missing_condition_fails(changes):
    assert not _verdict(**changes)


def test_late_marks_may_exceed_early_marks_by_one():
    assert _verdict(boundaries={13})
    assert _verdict(boundaries={1, 13, 14})
    assert not _verdict(boundaries={13, 14})


def test_early_and_late_marks_split_at_boundary_thirteen():
    verdict = story_verdict(5, 2, 2, {12, 13}, 0, True)
    assert (verdict.early_marks, verdict.late_marks, verdict.boundary_marks) == (1, 1, 2)


def test_picks_count_the_chain_side_per_question():
    assert picks_of_chain(["앞앞뒤", "뒤앞앞"], [True, False]) == [2, 1, 0]


@pytest.mark.parametrize("picks", [["앞앞"], ["앞앞뒤", "앞앞뒤"], ["앞앞X"]])
def test_malformed_picks_are_refused(picks):
    with pytest.raises(ValueError, match="앞/뒤"):
        picks_of_chain(picks, [True])


def test_render_validity_uses_fixed_limits():
    assert RenderValidity(22, 1).valid
    assert not RenderValidity(21, 1).valid
    assert not RenderValidity(22, 2).valid


@pytest.mark.parametrize(
    ("mark", "expected"),
    [
        (20.0, 1),
        (24.0, 1),
        (24.5, None),
        (19.0, 1),
        (18.5, None),
        (2.0, None),
        (61.0, 3),
    ],
)
def test_mark_maps_to_boundary_only_near_a_unit_start(mark, expected):
    assert marked_boundary(mark, STARTS) == expected


def test_overlapping_windows_pick_the_latest_started_unit():
    assert marked_boundary(5.0, [0.0, 2.3, 4.6, 6.9]) == 2
