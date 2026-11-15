import pytest

from spike.evaluation.eval_set.eval_normals import match_normals
from spike.evaluation.eval_set.eval_set import Flag, Unit, is_sure, locate, story_end_seconds, text_starts_with_quote, unit_start_seconds
from spike.listening.mark_time import mark_seconds
from spike.evaluation.eval_set.eval_vocab import Kind

STARTS = (0.0, 2.5, 6.0)
END = 20.0


def units(*specs: tuple[str, str, float]) -> list[Unit]:
    return [Unit(text=text, style=style, duration_sec=duration, pause_after_ms=500) for text, style, duration in specs]


def flag(listening: str, unit: int, *, at_boundary: bool = True, strong: bool = False, kind: Kind = "tone_jump") -> Flag:
    return Flag(listening=listening, render="r", unit=unit, kind=kind, at_boundary=at_boundary, strong=strong)


def test_unit_starts_add_duration_and_pause():
    story = units(("가", "calm", 2.0), ("나", "calm", 3.0), ("다", "calm", 1.0))
    assert unit_start_seconds(story) == (0.0, 2.5, 6.0)
    assert story_end_seconds(story) == 7.5


def test_mark_seconds_reads_minutes_and_fractional_seconds():
    assert mark_seconds("6:24") == 384.0
    assert mark_seconds("0:03.5") == 3.5


def test_overlapping_windows_prefer_the_unit_already_heard():
    found = locate(1.8, STARTS, END)
    assert (found.unit, found.at_boundary, found.offset_sec) == (0, True, 1.8)


def test_a_mark_just_before_a_start_belongs_to_that_boundary():
    found = locate(5.5, (0.0, 2.0, 6.0), END)
    assert (found.unit, found.at_boundary, found.offset_sec) == (2, True, -0.5)


def test_a_mark_deep_inside_a_long_unit_is_a_middle_mark():
    found = locate(16.0, STARTS, END)
    assert (found.unit, found.at_boundary, found.offset_sec) == (2, False, 10.0)


def test_a_mark_past_the_end_of_the_story_is_rejected():
    assert locate(21.5, STARTS, END).unit == 2  # 적은 시각의 오차(2초)까지는 받는다
    with pytest.raises(ValueError, match="벗어난다"):
        locate(23.0, STARTS, END)


def test_a_render_without_units_cannot_be_located():
    with pytest.raises(ValueError, match="단위가 없는"):
        locate(1.0, (), 0.0)


def test_a_repeated_boundary_flag_on_the_same_render_is_sure():
    flags = [flag("x", 3), flag("q", 3), flag("q", 5)]
    assert [is_sure(f, flags) for f in flags] == [True, True, False]


def test_middle_or_assembly_flags_elsewhere_do_not_make_a_flag_sure():
    flags = [flag("x", 3), flag("q", 3, at_boundary=False), flag("p", 3, kind="assembly_volume")]
    assert not is_sure(flags[0], flags)


def test_a_strong_middle_mark_or_an_assembly_fault_is_never_sure():
    flags = [flag("x", 3, at_boundary=False, strong=True), flag("x", 4, kind="assembly_volume", strong=True)]
    assert [is_sure(f, flags) for f in flags] == [False, False]


def test_normals_match_style_and_quote_and_are_not_reused():
    story = units(
        ("제목", "calm", 1.0),
        ("“와!”", "excited", 1.0),
        ("서술이에요.", "calm", 4.0),
        ("“우와!”", "excited", 1.2),
        ("“야호!”", "excited", 3.0),
        ("긴 서술이에요.", "calm", 9.0),
    )
    assert match_normals([1, 2, 1], story, frozenset({1, 2})) == (3, 5, 4)


def test_a_target_without_a_same_kind_unit_gets_no_normal():
    story = units(("제목", "calm", 1.0), ("“쉿”", "soft", 1.0), ("서술", "calm", 2.0))
    assert match_normals([1], story, frozenset({1})) == (None,)


def test_only_text_that_opens_with_a_quote_counts_as_dialogue():
    assert text_starts_with_quote(" “와!”") and text_starts_with_quote("‘음.’")
    assert not text_starts_with_quote("") and not text_starts_with_quote("토끼가")
