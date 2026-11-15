from pathlib import Path

import numpy as np

from fakes import SAMPLE_RATE, FixedPitchTracker, silence, tone
from spike.sound.audio import Audio
from spike.clone.catalog import load_reference_scripts
from spike.clone.reference.phonation_check import check_speaker

SPEECH = Audio(np.concatenate([silence(0.5), tone(sec=2.0)]), SAMPLE_RATE)


ALL_REFERENCES = frozenset({"A_calm.wav", "A_excited.wav", "A_soft.wav", "A_whisper.wav"})


def _check(f0: np.ndarray, present: frozenset[str] = ALL_REFERENCES):
    return check_speaker("p_sohee", load_reference_scripts(), Path("/rec"), FixedPitchTracker(f0), lambda _: SPEECH, lambda p: p.name in present)


def test_voiced_whisper_reference_is_flagged_and_voiced_soft_is_not():
    results = {r.path.stem.removeprefix("A_"): r for r in _check(np.full(250, 200.0))}
    assert results["whisper"].mismatched
    assert not results["soft"].mismatched and not results["calm"].mismatched


def test_missing_references_are_skipped():
    checked = _check(np.full(250, 200.0), frozenset({"A_calm.wav", "A_soft.wav"}))
    assert [r.path.name for r in checked] == ["A_calm.wav", "A_soft.wav"]


def test_nothing_is_checked_without_a_calm_anchor_or_its_pitch():
    assert _check(np.full(250, 200.0), frozenset({"A_whisper.wav"})) == []
    assert _check(np.full(250, np.nan)) == []


def test_excited_is_not_judged_because_its_pitch_may_leave_the_calm_band():
    unpitched = {r.path.stem.removeprefix("A_"): r for r in _check(np.concatenate([np.full(50, 200.0), np.full(200, np.nan)]))}
    assert unpitched["excited"].whisper and not unpitched["excited"].mismatched


class CountingPitchTracker:
    def __init__(self) -> None:
        self.calls = 0

    def track(self, audio: Audio) -> np.ndarray:
        self.calls += 1
        return np.full(250, 200.0)


def test_each_reference_is_pitch_tracked_once_including_the_calm_anchor():
    tracker = CountingPitchTracker()
    check_speaker("p_sohee", load_reference_scripts(), Path("/rec"), tracker, lambda _: SPEECH, lambda p: p.name in ALL_REFERENCES)
    assert tracker.calls == len(ALL_REFERENCES)
