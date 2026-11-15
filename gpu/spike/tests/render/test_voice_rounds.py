from spike.render.attempt.attempt_policy import MAX_ATTEMPTS
from spike.render.voice.voice_rounds import Takes, VoiceResult, reroll_rounds
from spike.render.voice.voice_rule import GroupNorm, VoiceRule, VoiceScore

RULE = VoiceRule(frozenset({"child"}), 0.1, 4, 2, "calm", 0.70, 0.50)
NORM = GroupNorm(12, 0.79)


class FakeRender:
    def __init__(self, groups: dict[tuple[int, int], float], failing: frozenset[tuple[int, int]] = frozenset()):
        self.groups, self.failing, self.calls = groups, failing, []

    def run(self, units, attempt):
        self.calls.append((tuple(units), attempt))

    def passed(self, unit, attempt):
        return (unit, attempt) not in self.failing

    def measure(self, unit, attempt):
        return VoiceScore(self.groups[(unit, attempt)], 0.6)


def _first(unit: int, group: float, attempt: int = 0) -> Takes:
    return Takes(((attempt, VoiceScore(group, 0.6)),))


def test_a_normal_unit_is_kept_without_rendering():
    render = FakeRender({})

    results = reroll_rounds({4: _first(4, 0.81)}, NORM, RULE, render.run, render.passed, render.measure)

    assert render.calls == [] and results == {4: VoiceResult(0, VoiceScore(0.81, 0.6), 0, "keep")}


def test_a_reroll_that_reaches_the_normal_range_stops_and_is_used():
    render = FakeRender({(1, MAX_ATTEMPTS): 0.84})

    results = reroll_rounds({1: _first(1, 0.325)}, NORM, RULE, render.run, render.passed, render.measure)

    assert render.calls == [((1,), MAX_ATTEMPTS)]
    assert results[1] == VoiceResult(MAX_ATTEMPTS, VoiceScore(0.84, 0.6), 1, "keep")


def test_units_reroll_together_and_fall_back_only_below_the_floor():
    render = FakeRender({(1, 3): 0.40, (1, 4): 0.45, (5, 3): 0.74, (5, 4): 0.72})

    results = reroll_rounds({1: _first(1, 0.325), 5: _first(5, 0.776)}, NORM, RULE, render.run, render.passed, render.measure)

    assert render.calls == [((1, 5), 3), ((1, 5), 4)]
    assert (results[1].step, results[1].attempt, results[1].rerolls) == ("fallback", 4, 2)
    assert (results[5].step, results[5].attempt) == ("keep", 0)


def test_a_reroll_that_fails_qc_is_never_chosen():
    render = FakeRender({(1, 3): 0.95, (1, 4): 0.50}, failing=frozenset({(1, 3)}))

    results = reroll_rounds({1: _first(1, 0.325)}, NORM, RULE, render.run, render.passed, render.measure)

    assert (results[1].attempt, results[1].score.group, results[1].step) == (4, 0.50, "fallback")
