import numpy as np
import pytest
from fakes import SAMPLE_RATE, FixedPitchTracker, gliding_f0, silence, tone

from spike.sound.audio import Audio
from spike.evaluation.render_eval.long_form_eval import Boundary
from spike.evaluation.render_eval.story_trend import UnitTrend, halves, mean_abs_f0_change, paired_differences, unit_trend


class FixedEmbedder:
    def embed(self, audio: Audio) -> np.ndarray:
        return np.array([1.0, 0.0])


def _trend(rate: float | None = 5.0, similarity: float = 0.8) -> UnitTrend:
    return UnitTrend(50.0, 6.0, rate, 0.1, similarity)


def test_unit_trend_measures_every_metric():
    audio = Audio(np.concatenate([silence(0.5), tone(sec=2.0)]), SAMPLE_RATE)
    trend = unit_trend("가나다라마바", audio, FixedPitchTracker(gliding_f0(200, 400)), FixedEmbedder(), np.array([1.0, 0.0]))
    assert trend.lead_silence_sec == pytest.approx(0.5, abs=0.05)
    assert trend.syllables_per_sec == pytest.approx(3.0, abs=0.2)
    assert trend.reference_similarity == pytest.approx(1.0)
    assert trend.f0_range_semitones == pytest.approx(0.8 * 12, abs=0.1)
    assert trend.median_semitones == pytest.approx(12 * np.log2(200 * 2**0.5), abs=0.1)


def test_unit_without_pitch_leaves_pitch_metrics_unknown():
    silent_f0 = np.full(100, np.nan)
    audio = Audio(tone(sec=1.0), SAMPLE_RATE)
    trend = unit_trend("가나", audio, FixedPitchTracker(silent_f0), FixedEmbedder(), np.array([1.0, 0.0]))
    assert (trend.median_semitones, trend.f0_range_semitones) == (None, None)


def test_differences_subtract_the_baseline_from_the_compared_render():
    [difference] = paired_differences([_trend(5.0, 0.8)], [_trend(5.5, 0.7)])
    assert difference.syllables_per_sec == pytest.approx(0.5)
    assert difference.reference_similarity == pytest.approx(-0.1)
    assert difference.median_semitones == 0


def test_difference_with_an_unknown_side_stays_unknown():
    [difference] = paired_differences([_trend(None)], [_trend(5.0)])
    assert difference.syllables_per_sec is None


def test_renders_with_different_unit_counts_are_refused():
    with pytest.raises(ValueError, match="묶음 수"):
        paired_differences([_trend()], [])


def test_halves_expose_a_change_that_builds_up():
    trends = [_trend(rate) for rate in (0.0, 0.2, 0.4, 0.6)]
    assert halves(trends, "syllables_per_sec") == pytest.approx((0.1, 0.5))


def test_f0_change_averages_sizes_and_skips_unmeasured_boundaries():
    boundaries = [Boundary(0, 0.0, 0.0, 2.0), Boundary(1, 1.0, 0.0, -4.0), Boundary(2, 2.0, 0.0, None)]
    assert mean_abs_f0_change(boundaries) == pytest.approx(3.0)


def test_f0_change_without_measurable_boundaries_is_unknown():
    assert mean_abs_f0_change([Boundary(0, 0.0, 0.0, None)]) is None
    assert mean_abs_f0_change([]) is None


def test_halves_skip_unknown_values():
    trends = [_trend(None), _trend(1.0), _trend(None), _trend(None)]
    assert halves(trends, "syllables_per_sec") == (1.0, None)
