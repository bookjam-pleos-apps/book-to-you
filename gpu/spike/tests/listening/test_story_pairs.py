import json
from collections import Counter

import numpy as np
import pytest

from spike.sound.audio import Audio
from spike.clone.catalog import DATA_DIR
from spike.listening.listening_plan import SpeechSpan
from spike.listening.pair_clips import PairPlan, boundary_samples, pair_slots, parse_pair_plan

RATE = 10
STORY = Audio(np.arange(1000, dtype=np.float32), RATE)
SPANS = [SpeechSpan(0, 100), SpeechSpan(200, 300), SpeechSpan(400, 700)]
PLAN = PairPlan((1, 2, 3, 4, 5, 6), 15.0, 7)
STAGE_TWO_UNITS = {5, 6, 7, 8, 17, 20, 24, 25}


def test_fixed_plan_avoids_units_used_in_stage_two():
    plan = parse_pair_plan(json.loads((DATA_DIR / "story-pairs.json").read_text(encoding="utf-8")))
    assert len(plan.boundaries) == 6
    assert not set(plan.boundaries) & STAGE_TWO_UNITS


def test_boundary_zero_is_refused():
    with pytest.raises(ValueError, match="경계 번호"):
        parse_pair_plan({"boundaries": [0, 2], "sideSec": 15.0, "seed": 1})


def test_clip_keeps_the_pause_between_both_sides():
    clip = boundary_samples(STORY, SPANS, 1, 5.0)
    assert (clip[0], clip[-1]) == (50.0, 249.0)


def test_short_unit_is_used_only_as_far_as_it_goes():
    clip = boundary_samples(STORY, SPANS, 1, 15.0)
    assert (clip[0], clip[-1]) == (0.0, 299.0)


def test_each_pair_sits_together_with_both_conditions():
    slots = pair_slots(PLAN, ("current", "chain"))
    assert [slot.pair for slot in slots] == [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
    assert [slot.unit for slot in slots[::2]] == list(PLAN.boundaries)
    assert all({first.condition, second.condition} == {"current", "chain"} for first, second in zip(slots[::2], slots[1::2]))


def test_order_is_fixed_by_the_seed():
    assert pair_slots(PLAN, ("a", "b")) == pair_slots(PLAN, ("a", "b"))


def test_first_clips_are_balanced_between_conditions():
    plan = PairPlan(tuple(range(1, 41)), 15.0, 7)
    assert Counter(slot.condition for slot in pair_slots(plan, ("a", "b"))[::2]) == {"a": 20, "b": 20}


def test_fixed_plan_order_gives_no_alternating_pattern():
    plan = parse_pair_plan(json.loads((DATA_DIR / "story-pairs.json").read_text(encoding="utf-8")))
    firsts = [slot.condition for slot in pair_slots(plan, ("a", "b"))[::2]]
    assert Counter(firsts) == {"a": 3, "b": 3}
    assert any(first == second for first, second in zip(firsts, firsts[1:]))
