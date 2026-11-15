from pathlib import Path

from spike.render.trials.run_store import load_run, save_run


def test_missing_run_means_nothing_is_done(tmp_path: Path):
    assert load_run(tmp_path) == []


def test_saved_run_reads_back(tmp_path: Path):
    records = [{"file": "chain/a.wav", "unit": 5}]
    save_run(tmp_path, records)
    assert load_run(tmp_path) == records
