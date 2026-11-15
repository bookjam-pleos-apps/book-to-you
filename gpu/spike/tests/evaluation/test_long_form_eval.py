import numpy as np
import pytest

from spike.sound.audio import Audio
from spike.evaluation.render_eval.long_form_eval import measure_boundaries

RATE = 24000
BOUND_AT = 3 * RATE


def _unit(level: float) -> Audio:
    silence = np.zeros(RATE // 2, dtype=np.float32)
    return Audio(np.concatenate([silence, np.full(2 * RATE, level, dtype=np.float32), silence]), RATE)


class PitchFromLevel:
    """테스트 신호는 세기가 일정하므로, 세기로 어느 단위의 끝인지 구분한다."""

    def track(self, audio: Audio) -> np.ndarray:
        return np.full(100, 200.0 if float(audio.samples.mean()) > 0.15 else 100.0)


class Unpitched:
    def track(self, audio: Audio) -> np.ndarray:
        return np.full(100, np.nan)


def test_boundary_measures_speech_edges_without_surrounding_silence():
    [boundary] = measure_boundaries([_unit(0.1), _unit(0.2)], [0, BOUND_AT], PitchFromLevel())
    assert boundary.delta_energy_db == pytest.approx(6.02, abs=0.01)
    assert boundary.delta_f0_semitones == pytest.approx(12.0)


def test_boundary_reports_story_time_of_the_following_unit():
    [boundary] = measure_boundaries([_unit(0.1), _unit(0.1)], [0, BOUND_AT], PitchFromLevel())
    assert (boundary.unit, boundary.at_sec) == (0, 3.0)


def test_unpitched_edge_keeps_energy_and_leaves_pitch_empty():
    [boundary] = measure_boundaries([_unit(0.1), _unit(0.2)], [0, BOUND_AT], Unpitched())
    assert boundary.delta_f0_semitones is None
    assert boundary.delta_energy_db > 0


def test_speechless_unit_is_skipped():
    silent = Audio(np.zeros(RATE, dtype=np.float32), RATE)
    assert measure_boundaries([silent, _unit(0.1)], [0, RATE], PitchFromLevel()) == []


def test_single_unit_has_no_boundary():
    assert measure_boundaries([_unit(0.1)], [0], PitchFromLevel()) == []
