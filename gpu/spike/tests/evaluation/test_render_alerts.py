import json

import numpy as np
import pytest
from fakes import SAMPLE_RATE, silence, tone

from spike.sound.audio import Audio
from spike.evaluation.eval_set.eval_set import Unit
from spike.evaluation.render_eval.render_alert_measure import alert_inputs, speech_windows, unit_similarities
from spike.evaluation.render_eval.render_alerts import (
    AlertInputs, WindowSim, bottom_share, breakage_alert, build_alerts, story_length_problem, window_shift_alert, window_unit,
)

ALERT_KINDS = {"voiceShift", "voiceShiftWindows", "breakage"}


class LevelEmbedder:
    """소리 크기(최대 절댓값)로 방향이 바뀌는 2차원 임베딩. 작은 소리일수록 평균 목소리에서 멀어진다."""

    def embed(self, audio: Audio) -> np.ndarray:
        level = float(np.max(np.abs(audio.samples))) if len(audio.samples) else 0.0
        return np.array([level, 1.0 - level])


def _inputs(unit_sims: list[float], komos: list[float] | None = None) -> AlertInputs:
    starts = [10.0 * i for i in range(len(unit_sims))]
    return AlertInputs(unit_sims=unit_sims, windows=[], unit_starts=starts, story_end_sec=10.0 * len(unit_sims), komos=komos)


def test_bottom_share_picks_at_least_one_when_there_are_few_units():
    assert bottom_share({1: 0.9, 2: 0.5, 3: 0.7}) == [2]


def test_bottom_share_rounds_up_and_returns_unit_order():
    values = {i: 1.0 - i / 100 for i in range(1, 12)}
    assert bottom_share(values) == [10, 11]


def test_bottom_share_of_nothing_is_empty():
    assert bottom_share({}) == []


def test_the_title_unit_is_never_a_voice_shift_alert():
    alerts = build_alerts(_inputs([0.1, 0.8, 0.9, 0.7]))
    assert alerts["voiceShift"]["units"] == [{"unit": 3, "similarity": 0.7}]


def test_a_window_belongs_to_the_unit_it_overlaps_most():
    starts, end = [0.0, 3.0, 9.0], 20.0
    assert window_unit(0.0, starts, end) == 1
    assert window_unit(8.0, starts, end) == 2
    assert window_unit(12.0, starts, end) == 2


def test_windows_owned_by_the_title_are_not_ranked():
    windows = [WindowSim(0.0, 0.1), WindowSim(4.0, 0.6), WindowSim(8.0, 0.9)]
    inputs = AlertInputs(unit_sims=[0.9, 0.9, 0.9], windows=windows, unit_starts=[0.0, 5.0, 12.0], story_end_sec=20.0)
    shifted = build_alerts(inputs)["voiceShiftWindows"]
    assert shifted["units"] == [1]
    assert shifted["windows"] == [{"startSec": 4.0, "similarity": 0.6, "unit": 1}]


def test_breakage_is_not_measured_without_komos():
    alerts = build_alerts(_inputs([0.9, 0.8, 0.7]))
    assert alerts["breakage"] == {"measured": False}


def test_a_komos_drop_far_below_the_render_median_is_breakage():
    komos = [1.0, 3.5, 3.6, 3.4, 3.5, 2.0]
    alert = breakage_alert(komos)
    assert alert["units"] == [{"unit": 5, "komos": 2.0}]
    assert alert["threshold"] == "uncalibrated"


def test_flat_komos_scores_raise_no_breakage():
    assert breakage_alert([3.0] * 6)["units"] == []


def test_komos_count_must_match_units():
    with pytest.raises(ValueError):
        build_alerts(_inputs([0.9, 0.8], komos=[3.0]))


def test_alerts_are_json_with_three_separate_kinds():
    alerts = build_alerts(_inputs([0.9, 0.8, 0.7], komos=[3.0, 3.1, 3.2]))
    assert ALERT_KINDS <= alerts.keys()
    assert all(alerts[kind]["measured"] for kind in ALERT_KINDS)
    assert json.loads(json.dumps(alerts, ensure_ascii=False)) == alerts


def test_speech_windows_drop_mostly_silent_windows():
    story = Audio(np.concatenate([tone(sec=11.0), silence(14.0)]), SAMPLE_RATE)
    assert [t for t, _ in speech_windows(story)] == [0.0, 4.0]


def test_centroid_similarity_is_lowest_for_the_odd_unit():
    units = [Audio(tone(level=level), SAMPLE_RATE) for level in (0.5, 0.5, 0.1, 0.5)]
    sims = unit_similarities(LevelEmbedder(), units)
    assert int(np.argmin(sims)) == 2


def test_alert_inputs_place_units_with_their_pauses():
    units = [Unit("제목", "calm", 1.0, 500), Unit("본문", "calm", 2.0, 0)]
    audio = [Audio(tone(sec=1.0), SAMPLE_RATE), Audio(tone(sec=2.0), SAMPLE_RATE)]
    story = Audio(tone(sec=3.5), SAMPLE_RATE)
    inputs = alert_inputs(LevelEmbedder(), units, audio, story, None)
    assert (tuple(inputs.unit_starts), inputs.story_end_sec, inputs.komos) == ((0.0, 1.5), 3.5, None)


def test_nan_values_are_not_ranked_but_listed_as_unmeasured():
    values = {1: 0.9, 2: float("nan"), 3: 0.5, 4: 0.8}
    assert bottom_share(values) == [3]
    alert = build_alerts(_inputs([0.9, 0.9, float("nan"), 0.5, 0.8]))["voiceShift"]
    assert (alert["units"], alert["unmeasured"]) == ([{"unit": 3, "similarity": 0.5}], [2])


def test_a_window_past_the_last_unit_belongs_to_no_unit():
    assert window_unit(30.0, [0.0, 5.0], 20.0) is None


def test_unmapped_windows_are_counted_not_given_to_the_title():
    windows = [WindowSim(4.0, 0.6), WindowSim(30.0, 0.1)]
    alert = window_shift_alert(windows, [0.0, 2.0], 20.0)
    assert (alert["unmappedWindows"], alert["units"]) == (1, [1])


def test_story_longer_than_its_units_is_refused():
    assert story_length_problem(20.4, 20.0) is None
    assert "허용 0.5초" in story_length_problem(21.0, 20.0)
    units = [Unit("제목", "calm", 1.0, 0), Unit("본문", "calm", 1.0, 0)]
    audio = [Audio(tone(sec=1.0), SAMPLE_RATE)] * 2
    with pytest.raises(ValueError, match="다르다"):
        alert_inputs(LevelEmbedder(), units, audio, Audio(tone(sec=3.0), SAMPLE_RATE), None)


def test_a_tiny_komos_dip_on_a_flat_scale_is_not_breakage():
    """유사도용 바닥(1e-3)이면 2.995가 경보였다. KOMOS 척도 바닥(0.05점)에서는 아니다."""
    assert breakage_alert([3.0, 4, 3, 3, 3, 3, 2.995])["units"] == []


def test_unscored_komos_units_are_listed_not_ranked():
    alert = breakage_alert([1.0, 3.5, float("nan"), 3.4, 3.5, 2.0])
    assert (alert["units"], alert["unmeasured"]) == ([{"unit": 5, "komos": 2.0}], [2])
