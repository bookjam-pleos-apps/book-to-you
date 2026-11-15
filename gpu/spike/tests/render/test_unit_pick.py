import numpy as np
import pytest

from spike.render.trials.unit_pick import (
    choose_units, mad_low_outliers, pick_by_similarity, picked_folders, pitch_outliers, similarity_outliers, unit_count_problems,
)


def test_pitch_is_judged_against_units_of_the_same_style():
    # 두 후보, 세 단위. excited는 원래 높아서 calm과 섞어 보면 안 된다.
    pitch = np.array([[0.0, 6.0, 0.5], [0.2, 6.5, 5.0]])
    outliers = pitch_outliers(pitch, ["calm", "excited", "calm"])
    assert outliers.tolist() == [[False, False, False], [False, False, True]]


def test_a_voice_far_from_the_rest_is_an_outlier():
    similarity = np.array([[0.80, 0.81, 0.79], [0.80, 0.40, 0.82]])
    assert similarity_outliers(similarity).tolist() == [[False, False, False], [False, True, False]]


def test_flat_similarity_does_not_make_everything_an_outlier():
    assert not similarity_outliers(np.full((2, 3), 0.8)).any()


def test_the_candidate_that_is_not_an_outlier_wins_even_if_less_similar():
    outliers = np.array([[True, False], [False, False]])
    similarity = np.array([[0.90, 0.70], [0.60, 0.75]])
    picks = choose_units(outliers, similarity)
    assert picks.picks == (1, 1)
    assert picks.flagged == ()
    assert picks.outliers_per_run == (1, 0)


def test_units_where_every_candidate_is_an_outlier_are_flagged_for_listening():
    outliers = np.array([[True, False], [True, False]])
    picks = choose_units(outliers, np.array([[0.5, 0.7], [0.6, 0.8]]))
    assert picks.picks == (1, 1)
    assert picks.flagged == (0,)


def test_renders_from_different_plans_are_refused():
    assert unit_count_problems([51, 51]) == []
    assert unit_count_problems([51, 50])


def test_a_unit_without_measurable_pitch_is_not_a_pitch_outlier():
    pitch = np.array([[0.0, np.nan, 0.5], [0.2, 0.3, 0.4]])
    outliers = pitch_outliers(pitch, ["calm", "calm", "calm"])
    assert not outliers.any()


def test_a_candidate_that_failed_transcription_loses_even_when_both_are_outliers():
    similarity = np.array([[0.9, 0.9], [0.7, 0.7]])
    outliers = np.array([[False, False], [False, True]])
    passed = np.array([[False, False], [True, True]])
    picks = choose_units(outliers, similarity, passed)
    assert picks.picks == (1, 1)
    assert picks.flagged == (1,)
    assert (picks.outliers_per_run, picks.failed_per_run) == ((0, 1), (2, 0))


def test_a_candidate_whose_only_problem_is_pitch_is_not_penalised():
    # 후보 0의 단위 1은 음높이만 크게 튀고 유사도는 가장 높다. 음높이는 청취 지목과 맞지 않아(AUC 0.51) 벌점을 주지 않는다.
    similarity = np.array([[0.80, 0.85, 0.79], [0.81, 0.78, 0.80]])
    pitch = np.array([[0.0, 9.0, 0.2], [0.1, 0.2, 0.3]])
    picks = pick_by_similarity(similarity, pitch, ["calm", "calm", "calm"])
    assert picks.picks == (1, 0, 1)
    assert picks.flagged == ()
    assert picks.outliers_per_run == (0, 0)
    assert picks.pitch_outliers_per_run == (1, 0)


def test_similarity_outliers_still_lose_when_picking_by_similarity():
    similarity = np.array([[0.80, 0.81, 0.79], [0.80, 0.40, 0.82]])
    picks = pick_by_similarity(similarity, np.zeros((2, 3)), ["calm"] * 3)
    assert picks.picks[1] == 0
    assert picks.outliers_per_run == (0, 1)
    assert picks.pitch_outliers_per_run == (0, 0)


def test_mad_floor_follows_the_scale_of_the_values():
    values = np.array([4, 3, 3, 3, 3, 2.995])
    assert mad_low_outliers(values, 3.0, 1e-3).tolist() == [False] * 5 + [True]
    assert not mad_low_outliers(values, 3.0, 0.05).any()
    assert (similarity_outliers(values) == mad_low_outliers(values, 3.0, 1e-3)).all()


def test_picked_folders_prefer_root_relative_folders_over_cli_renders():
    assert picked_folders({"folders": ["outputs/a"], "renders": ["../a"]}) == ["outputs/a"]
    assert picked_folders({"renders": ["outputs/b"]}) == ["outputs/b"]
    with pytest.raises(ValueError):
        picked_folders({"picks": [0]})
