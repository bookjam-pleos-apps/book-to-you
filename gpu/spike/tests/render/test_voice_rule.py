import pytest

from spike.render.voice.voice_rule import (
    GroupNorm,
    VoiceRule,
    VoiceScore,
    best_score,
    flagged_in_group,
    group_norm,
    next_step,
    style_groups,
)

RULE = VoiceRule(frozenset({"child"}), 0.1, 4, 2, "calm", 0.70, 0.50)


def _scores(*groups: float, reference: float = 0.7) -> dict[int, VoiceScore]:
    return {index: VoiceScore(value, reference) for index, value in enumerate(groups)}


def test_only_the_target_styles_form_groups():
    assert style_groups({0: "calm", 1: "child", 2: "deep", 3: "child"}, RULE) == {"child": [1, 3]}


def test_a_large_group_flags_its_bottom_tenth_rounded_up():
    """fisherman child 12단위: 0.325와 그다음 낮은 단위 둘을 짚는다."""
    scores = _scores(0.85, 0.325, 0.80, 0.79, 0.88, 0.776, 0.81, 0.83, 0.782, 0.86, 0.87, 0.84)

    assert flagged_in_group(scores, list(scores), RULE) == [1, 5]


def test_a_small_group_is_judged_against_the_reference_recording():
    scores = {0: VoiceScore(0.2, 0.62), 1: VoiceScore(0.9, 0.24), 2: VoiceScore(0.95, 0.55)}

    assert flagged_in_group(scores, list(scores), RULE) == [1]
    assert group_norm(scores, list(scores), [1], RULE) == GroupNorm(3, None)


def test_the_normal_range_starts_at_the_lowest_unflagged_unit():
    scores = _scores(0.85, 0.325, 0.80, 0.79, 0.88)

    assert group_norm(scores, list(scores), [1], RULE) == GroupNorm(5, 0.79)


@pytest.mark.parametrize(("best", "rerolls", "step"), [
    (VoiceScore(0.80, 0.6), 0, "keep"),
    (VoiceScore(0.72, 0.6), 0, "reroll"),
    (VoiceScore(0.72, 0.6), 2, "keep"),
    (VoiceScore(0.40, 0.6), 1, "reroll"),
    (VoiceScore(0.40, 0.6), 2, "fallback"),
])
def test_a_large_group_rerolls_up_to_the_limit_and_falls_back_only_below_the_floor(best, rerolls, step):
    assert next_step(best, rerolls, GroupNorm(12, 0.79), RULE) == step


@pytest.mark.parametrize(("reference", "rerolls", "step"), [(0.55, 0, "keep"), (0.3, 1, "reroll"), (0.3, 2, "fallback")])
def test_a_small_group_uses_the_reference_floor(reference, rerolls, step):
    assert next_step(VoiceScore(0.1, reference), rerolls, GroupNorm(3, None), RULE) == step


def test_the_best_take_follows_the_measure_the_group_uses():
    takes = [VoiceScore(0.6, 0.7), VoiceScore(0.8, 0.4)]

    assert best_score(takes, GroupNorm(12, 0.79)) == takes[1]
    assert best_score(takes, GroupNorm(3, None)) == takes[0]
