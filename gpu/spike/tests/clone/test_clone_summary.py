from spike.clone.plan.clone_summary import summarize


def _entry(experiment: str, speed: float, hit: bool) -> dict:
    return {"experiment": experiment, "speedX": speed, "hitBudget": hit}


def test_groups_by_experiment_with_counts_and_median_speed():
    meta = {
        "a/1.wav": _entry("baseline", 1.0, False),
        "a/2.wav": _entry("baseline", 3.0, True),
        "b/1.wav": _entry("calm_only", 2.0, False),
    }
    assert summarize(meta) == {
        "baseline": {"generated": 2, "hitBudget": 1, "medianSpeedX": 2.0},
        "calm_only": {"generated": 1, "hitBudget": 0, "medianSpeedX": 2.0},
    }


def test_empty_meta_gives_empty_summary():
    assert summarize({}) == {}
