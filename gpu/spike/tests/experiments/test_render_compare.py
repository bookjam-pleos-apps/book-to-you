import math

import pytest

from spike.evaluation.render_eval.compare_config import parse_conditions, parse_thresholds
from spike.evaluation.render_eval.render_compare import (
    BASELINE, BETTER, NO_THRESHOLD, NO_VALUE, OTHER_REFERENCE, TOO_FEW_SEEDS, WITHIN_NOISE, WORSE,
    ConditionSpec, Threshold, compare_conditions, metric_value, render_mean,
)
from spike.experiments.measure.run_compare_renders import comparison_table

S4 = Threshold(min_difference=0.03, seed_noise_max=0.018, source="§7")


def _rows(render: str, value: float, title: float = 0.0) -> list[dict[str, object]]:
    """0번(제목)은 일부러 다른 값을 둬서 빠지는지 본다."""
    return [{"render": render, "unit": 0, "simHead": {"s4": title}},
            *({"render": render, "unit": i, "simHead": {"s4": value}, "simCentroid": 0.9} for i in (1, 2))]


def _specs(renders: dict[str, list[str]]) -> dict[str, ConditionSpec]:
    return {name: ConditionSpec(renders=tuple(r)) for name, r in renders.items()}


def _verdicts(shift: float, seeds: int = 2, threshold: Threshold | None = S4) -> dict[str, str]:
    renders = {"base": ["b1", "b2"], "new": [f"n{i}" for i in range(seeds)]}
    rows = [*_rows("b1", 0.70), *_rows("b2", 0.70), *(r for n in renders["new"] for r in _rows(n, 0.70 + shift))]
    return {r.name: r.verdict for r in compare_conditions(rows, _specs(renders), "base", threshold=threshold)}


def test_one_seed_is_too_few_even_for_a_big_difference():
    assert _verdicts(-0.2, seeds=1) == {"base": BASELINE, "new": TOO_FEW_SEEDS}


def test_difference_below_the_threshold_is_noise():
    assert _verdicts(-0.029)["new"] == WITHIN_NOISE
    assert _verdicts(0.029)["new"] == WITHIN_NOISE


def test_difference_over_the_threshold_is_worse_or_better():
    assert _verdicts(-0.031)["new"] == WORSE
    assert _verdicts(0.031)["new"] == BETTER


def test_a_key_without_a_threshold_is_not_judged():
    assert _verdicts(-0.2, threshold=None)["new"] == NO_THRESHOLD


def test_nan_values_are_left_out_of_the_render_mean():
    rows = [*_rows("r", 0.7), {"render": "r", "unit": 3, "simHead": {"s4": math.nan}}]
    assert metric_value(rows[-1], "simHead.s4") is None
    assert render_mean(rows, "r", "simHead.s4") == pytest.approx(0.7)


def test_a_condition_without_any_value_is_no_value_not_worse():
    rows = [*_rows("b1", 0.7), *_rows("b2", 0.7), *_rows("n1", math.nan), *_rows("n2", math.nan)]
    results = compare_conditions(rows, _specs({"base": ["b1", "b2"], "new": ["n1", "n2"]}), "base", threshold=S4)
    assert [r.verdict for r in results] == [BASELINE, NO_VALUE]


def test_a_different_reference_is_left_to_listening():
    rows = [*_rows("b1", 0.7), *_rows("b2", 0.7), *_rows("n1", 0.5), *_rows("n2", 0.5)]
    specs = {"base": ConditionSpec(("b1", "b2"), "s4"), "same": ConditionSpec(("n1", "n2"), "s4"), "other": ConditionSpec(("n1", "n2"), "s3")}
    assert {r.name: r.verdict for r in compare_conditions(rows, specs, "base", threshold=S4)} == {
        "base": BASELINE, "same": WORSE, "other": OTHER_REFERENCE}


def test_title_unit_is_left_out_of_the_render_mean():
    assert render_mean(_rows("r", 0.7, title=0.1), "r", "simHead.s4") == pytest.approx(0.7)


@pytest.mark.parametrize("key", ["simCentroid", "simPrev", "f0"])
def test_render_relative_keys_are_refused(key):
    with pytest.raises(ValueError, match="렌더 사이 비교"):
        compare_conditions(_rows("r", 0.7), _specs({"a": ["r"]}), "a", key=key)


def test_missing_baseline_or_render_is_an_error():
    with pytest.raises(ValueError):
        compare_conditions(_rows("r", 0.7), _specs({"a": ["r"]}), "b")
    with pytest.raises(ValueError):
        compare_conditions(_rows("r", 0.7), _specs({"a": ["없음"]}), "a")


def test_table_states_the_rule_seed_noise_and_one_line_per_condition():
    rows = [*_rows("x/b1", 0.7), *_rows("x/b2", 0.7)]
    results = compare_conditions(rows, {"base": ConditionSpec(("x/b1", "x/b2"), "s4")}, "base", threshold=S4)
    table = comparison_table(results, "simHead.s4", "base", S4)
    assert "seed 2개 이상" in table and "차이 최대 0.018" in table and "문턱 0.03" in table
    assert "| base | s4 | b1 0.700, b2 0.700 | 0.700 | +0.000 | 기준 |" in table


def test_conditions_json_accepts_old_lists_and_new_objects_with_a_reference():
    raw = {"conditions": {"r0": ["a", "b"], "r1": {"renders": ["c"], "reference": "s4"}}}
    assert parse_conditions(raw) == {"r0": ConditionSpec(("a", "b")), "r1": ConditionSpec(("c",), "s4")}


@pytest.mark.parametrize("raw", [[], {"conditions": []}, {"conditions": {"r0": "a"}}, {"conditions": {"r0": {"renders": ["a"], "reference": 4}}}])
def test_malformed_conditions_json_is_a_value_error(raw):
    with pytest.raises(ValueError):
        parse_conditions(raw)


def test_thresholds_json_is_read_per_key():
    raw = {"thresholds": {"simHead.s4": {"minDifference": 0.03, "seedNoiseMax": 0.018, "source": "§7"}}}
    assert parse_thresholds(raw) == {"simHead.s4": S4}
    with pytest.raises(ValueError):
        parse_thresholds({"thresholds": {"simHead.s4": {"minDifference": 0.03}}})
