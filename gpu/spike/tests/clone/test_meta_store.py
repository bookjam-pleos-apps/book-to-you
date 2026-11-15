import json
from pathlib import Path

from spike.clone.meta_store import merge_meta


def test_creates_file_and_parent_folder(tmp_path: Path):
    path = tmp_path / "s1" / "meta.json"
    merge_meta(path, {"a.wav": {"seed": 1}})
    assert json.loads(path.read_text()) == {"a.wav": {"seed": 1}}


def test_rerun_merges_and_overwrites_same_entry(tmp_path: Path):
    path = tmp_path / "meta.json"
    merge_meta(path, {"a.wav": {"seed": 1}, "b.wav": {"seed": 2}})
    merge_meta(path, {"a.wav": {"seed": 9}})
    assert json.loads(path.read_text()) == {"a.wav": {"seed": 9}, "b.wav": {"seed": 2}}


def test_leaves_no_partial_file_behind(tmp_path: Path):
    merge_meta(tmp_path / "meta.json", {"a.wav": {"seed": 1}})
    assert [p.name for p in tmp_path.iterdir()] == ["meta.json"]
