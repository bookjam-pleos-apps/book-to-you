from pathlib import Path

import pytest

from spike.experiments.render.run_pick_units import pick_report, root_folders
from spike.render.trials.unit_pick import UnitPicks


def test_folders_are_written_relative_to_the_spike_root(tmp_path: Path, monkeypatch):
    (tmp_path / "outputs" / "a").mkdir(parents=True)
    monkeypatch.chdir(tmp_path / "outputs")
    assert root_folders([Path("a")], tmp_path) == ["outputs/a"]
    with pytest.raises(ValueError):
        root_folders([Path("/elsewhere")], tmp_path)


def test_pick_report_keeps_renders_and_names_the_similarity_flags():
    picks = UnitPicks(picks=(0, 1), flagged=(1,), outliers_per_run=(0, 1), failed_per_run=(0, 0), pitch_outliers_per_run=(2, 0))
    report = pick_report([Path("a")], ["outputs/a"], picks)
    assert (report["folders"], report["renders"], report["similarityFlaggedUnits"]) == (["outputs/a"], ["a"], (1,))
    assert "flaggedUnits" not in report
