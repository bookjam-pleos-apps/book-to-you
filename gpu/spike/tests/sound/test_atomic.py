from pathlib import Path

import pytest

from spike.sound.atomic import atomic_path, partial_path


def test_file_appears_only_after_block_succeeds(tmp_path: Path):
    dst = tmp_path / "sub" / "a.wav"
    with atomic_path(dst) as tmp:
        tmp.write_bytes(b"ok")
        assert not dst.exists()
    assert dst.read_bytes() == b"ok" and not partial_path(dst).exists()


def test_failure_leaves_neither_final_nor_partial_file(tmp_path: Path):
    dst = tmp_path / "a.wav"
    with pytest.raises(RuntimeError), atomic_path(dst) as tmp:
        tmp.write_bytes(b"half")
        raise RuntimeError("interrupted")
    assert not dst.exists() and not partial_path(dst).exists()


def test_partial_path_keeps_extension_for_format_detection():
    assert partial_path(Path("/x/A_calm.m4a")).suffix == ".m4a"
