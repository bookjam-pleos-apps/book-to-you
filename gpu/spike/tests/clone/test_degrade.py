import shutil
import subprocess
from pathlib import Path

import pytest

from spike.clone.reference.degrade import PROFILES, degrade
from spike.clone.layout import CONDITION_EXTENSION, reference_path


def test_profiles_use_distinct_conditions():
    assert sorted(p.condition for p in PROFILES) == ["B", "C"]


def test_reference_extension_follows_condition():
    paths = {c: reference_path(Path("/r"), "s1", c, "calm").suffix for c in CONDITION_EXTENSION}
    assert paths == {"A": ".wav", "B": ".m4a", "C": ".webm"}


def _sine_wav(path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=2", "-ar", "24000", str(path)],
        check=True,
    )


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
@pytest.mark.parametrize("profile", PROFILES, ids=lambda p: p.condition)
def test_degrade_produces_playable_file(tmp_path: Path, profile):
    clean = reference_path(tmp_path, "s1", "A", "calm")
    clean.parent.mkdir(parents=True)
    _sine_wav(clean)
    out = reference_path(tmp_path, "s1", profile.condition, "calm")
    degrade(clean, out, profile)
    assert out.stat().st_size > 1000
