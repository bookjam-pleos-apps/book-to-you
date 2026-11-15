import math

from spike.evaluation.eval_set.metric_agreement import Agreement, Stratum, agreement, pair_wins, stratified_auc, verdict


def test_ties_count_half_and_nan_is_dropped():
    assert pair_wins([2.0, 1.0, math.nan], [1.0]) == (1.5, 2)


def test_strata_are_never_compared_across_listenings():
    # 청취 A는 값이 전부 크고 B는 전부 작다. 섞어서 세면 1.0이 되지만 청취 안에서는 0.5다.
    strata = [Stratum((10.0,), (10.0,)), Stratum((0.0,), (0.0,))]
    assert stratified_auc(strata) == (0.5, 2)


def test_bootstrap_is_reproducible_and_brackets_the_estimate():
    strata = [Stratum((3.0, 4.0, 5.0), (1.0, 2.0, 3.5)), Stratum((2.0,), (1.0, 0.0))]
    first, second = agreement(strata, seed=7), agreement(strata, seed=7)
    assert first == second
    assert first.low <= first.auc <= first.high
    assert first.pairs == 11


def test_an_empty_stratum_yields_no_verdict():
    assert verdict(agreement([Stratum((), (1.0,))])) == "판정 불가"


def test_verdict_bands():
    assert verdict(Agreement(0.75, 0.62, 0.86, 100)) == "믿을 만함"
    assert verdict(Agreement(0.75, 0.45, 0.90, 10)) == "약함"
    assert verdict(Agreement(0.55, 0.40, 0.70, 100)) == "못 믿음"
    assert verdict(Agreement(0.30, 0.18, 0.44, 100)) == "귀와 반대"
