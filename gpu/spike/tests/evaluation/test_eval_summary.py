from spike.evaluation.clone_eval.eval_summary import PassCriteria, group_summary, summarize_evaluations


def _entry(experiment: str = "baseline", style: str = "calm", condition: str = "A", **metrics: object) -> dict:
    defaults = {"cer": 0.0, "hitBudget": False, "longestGapSec": 0.4, "syllables": 20, "simRatio": 0.9, "rateRatio": 1.0}
    return {"experiment": experiment, "sentenceStyle": style, "condition": condition, **defaults, **metrics}


def test_good_group_passes_every_line():
    summary = group_summary([_entry(), _entry(cer=0.02)], PassCriteria())
    assert summary["pass"] == {"cer": True, "firstTryFatal": True, "similarity": True, "rate": True}
    assert summary["medianCer"] == 0.01


def test_hit_budget_large_cer_or_long_stall_counts_as_fatal():
    entries = [_entry(hitBudget=True), _entry(cer=0.25), _entry(longestGapSec=2.0), _entry()]
    summary = group_summary(entries, PassCriteria())
    assert summary["firstTryFatalRate"] == 0.75
    assert summary["fatalCauses"] == {"budget": 1, "cer": 1, "gap": 1}
    assert summary["pass"]["firstTryFatal"] is False


def test_speech_rate_outside_ten_percent_fails():
    assert group_summary([_entry(rateRatio=1.15)], PassCriteria())["pass"]["rate"] is False
    assert group_summary([_entry(rateRatio=0.92)], PassCriteria())["pass"]["rate"] is True


def test_missing_baseline_metrics_are_neither_pass_nor_fail():
    summary = group_summary([_entry(simRatio=None, rateRatio=None)], PassCriteria())
    assert summary["pass"]["similarity"] is None and summary["pass"]["rate"] is None


def test_summary_splits_by_experiment_style_condition_and_length():
    meta = {
        "1": _entry(style="calm", condition="A"),
        "2": _entry(style="excited", condition="B"),
        "3": _entry(experiment="calm_only", style="excited", condition="B"),
        "4": _entry(syllables=11),
    }
    summary = summarize_evaluations(meta)
    assert sorted(summary) == ["baseline", "calm_only"]
    assert summary["baseline"]["all"]["n"] == 3
    assert sorted(summary["baseline"]["bySentenceStyle"]) == ["calm", "excited"]
    assert sorted(summary["baseline"]["byCondition"]) == ["A", "B"]
    assert {band: group["n"] for band, group in summary["baseline"]["byLength"].items()} == {"long": 2, "short": 1}


def test_clones_from_gate_failed_references_are_left_out_and_counted():
    meta = {"ok": _entry(simRatio=0.9), "drifted": _entry(simRatio=1.2, referenceIdentityOk=False)}
    summary = summarize_evaluations(meta)["baseline"]
    assert summary["excludedByIdentityGate"] == 1
    assert summary["all"]["n"] == 1 and summary["all"]["medianSimRatio"] == 0.9


def test_experiment_with_only_gate_failed_references_has_no_overall_summary():
    summary = summarize_evaluations({"drifted": _entry(referenceIdentityOk=False)})["baseline"]
    assert summary["all"] is None and summary["bySentenceStyle"] == {}
