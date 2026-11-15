from dataclasses import replace

import numpy as np
import pytest
from fakes import PASSAGE_RATE, rendered_passage

from spike.sound.audio import Audio
from spike.evaluation.render_eval.story_quality import (
    _windows,
    centroid_similarity_mean,
    effective_rate,
    fastest_unit_changes,
    lowest_window_similarity,
    missing_candidates,
    rate_drift,
    similarity_change,
    story_bar_checks,
    style_similarity_means,
)
from spike.evaluation.render_eval.story_trend import UnitTrend

TEN_SYLLABLES = "가나다라마바사아자차"


def _trend(rate: float | None = 5.0, similarity: float = 0.8) -> UnitTrend:
    return UnitTrend(50.0, 6.0, rate, 0.1, similarity)


def _unit(text: str = TEN_SYLLABLES, pause_ms: int = 500, seconds: float = 1.5, style: str = "calm"):
    item = rendered_passage(text)
    audio = Audio(np.full(int(PASSAGE_RATE * seconds), 0.3, dtype=np.float32), PASSAGE_RATE)
    return replace(item, audio=audio, sentence=replace(item.sentence, pause_after_ms=pause_ms, style=style))


def _bar(checks, name: str):
    return next(check for check in checks if check.name == name)


class IndexEmbedder:
    """창마다 정해진 방향을 돌려준다. 창을 몇 개 쟀는지도 드러난다."""

    def __init__(self, vectors: list[list[float]]):
        self._vectors = iter(vectors)

    def embed(self, audio: Audio) -> np.ndarray:
        return np.array(next(self._vectors))


def test_effective_rate_counts_the_pauses_the_listener_hears():
    assert effective_rate([_unit(), _unit()]) == pytest.approx(20 / 4.0)


def test_rate_drift_is_the_growth_of_the_paired_difference():
    differences = [_trend(0.5), _trend(0.5), _trend(0.9), _trend(0.9)]
    assert rate_drift(differences) == pytest.approx(0.4)


def test_rate_drift_is_unknown_when_a_half_has_no_rate():
    assert rate_drift([_trend(None), _trend(0.9)]) is None


def test_similarity_change_compares_last_and_first_thirds():
    trends = [_trend(similarity=value) for value in (0.8, 0.8, 0.7, 0.7, 0.6, 0.6)]
    assert similarity_change(trends) == pytest.approx(-0.2)


def test_short_unit_is_measured_whole_instead_of_dropped():
    audio = Audio(np.zeros(3 * PASSAGE_RATE, dtype=np.float32), PASSAGE_RATE)
    assert [len(window.samples) for window in _windows(audio)] == [3 * PASSAGE_RATE]


def test_long_unit_windows_cover_it_at_the_hop():
    audio = Audio(np.zeros(16 * PASSAGE_RATE, dtype=np.float32), PASSAGE_RATE)
    assert len(_windows(audio)) == 3


def test_last_window_reaches_the_end_of_the_unit():
    samples = np.arange(19 * PASSAGE_RATE, dtype=np.float32)
    windows = _windows(Audio(samples, PASSAGE_RATE))
    assert [float(window.samples[0]) / PASSAGE_RATE for window in windows] == [0.0, 4.0, 8.0, 11.0]
    assert windows[-1].samples[-1] == samples[-1]


def test_lowest_window_finds_the_moment_an_average_hides():
    item = replace(rendered_passage(), audio=Audio(np.zeros(16 * PASSAGE_RATE, dtype=np.float32), PASSAGE_RATE))
    embedder = IndexEmbedder([[1.0, 0.0], [0.0, 1.0], [1.0, 0.0]])
    assert lowest_window_similarity([item], embedder, {"calm": np.array([1.0, 0.0])}) == pytest.approx(0.0)


def test_window_is_compared_with_the_reference_of_its_own_style():
    item = _unit(style="excited", seconds=3.0)
    references = {"calm": np.array([1.0, 0.0]), "excited": np.array([0.0, 1.0])}
    assert lowest_window_similarity([item], IndexEmbedder([[0.0, 1.0]]), references) == pytest.approx(1.0)


def test_fastest_units_list_the_spikes_an_average_hides():
    differences = [_trend(0.1), _trend(None), _trend(0.77), _trend(-0.2), _trend(0.75)]
    assert fastest_unit_changes(differences, count=2) == [(2, 0.77), (4, 0.75)]


def test_no_fastest_units_without_rates():
    assert fastest_unit_changes([_trend(None)]) == []


def test_similarity_bars_ignore_excited_units_because_the_line_was_set_on_calm():
    rendered = [_unit(), _unit(style="excited"), _unit()]
    trends = [_trend(similarity=0.8), _trend(similarity=0.4), _trend(similarity=0.8)]
    checks = story_bar_checks(rendered, [_trend(0.0)] * 3, trends)
    assert _bar(checks, "유사도 평균").value == pytest.approx(0.8)
    assert style_similarity_means(rendered, trends) == pytest.approx({"calm": 0.8, "excited": 0.4})


def test_render_without_calm_has_no_similarity_value_and_fails():
    checks = story_bar_checks([_unit(style="excited")], [_trend(0.0)], [_trend(similarity=0.9)])
    assert _bar(checks, "유사도 평균").passed is False
    assert _bar(checks, "유사도 변화").value is None


def test_chain_like_render_fails_and_baseline_like_render_passes():
    good = story_bar_checks([_unit()] * 6, [_trend(0.0)] * 4, [_trend(similarity=0.76)] * 6)
    drifting = [_trend(0.5), _trend(0.5), _trend(1.0), _trend(1.0)]
    lost = [_trend(similarity=value) for value in (0.65, 0.65, 0.6, 0.6, 0.55, 0.55)]
    bad = story_bar_checks([replace(_unit(), passed=False)] * 6, drifting, lost)
    assert all(check.passed for check in good)
    assert {check.name for check in bad if not check.passed} == {"속도 누적", "유사도 평균", "유사도 변화", "실패 단위"}


def test_dropped_short_sentence_fails_although_cer_would_pass():
    kept = "옛날 옛적 아주 먼 나라에 마음씨 고운 왕녀님이 살았습니다 어느 날 왕녀님은 숲으로 산책을 나갔습니다"
    unit = replace(_unit(f"{kept} 그 공은 금빛이었어요"), transcript=kept)
    assert missing_candidates([_unit(), unit]) == [(1, 9)]
    checks = story_bar_checks([unit], [_trend()], [_trend()])
    assert _bar(checks, "대본 누락 후보").passed is False


def test_unknown_value_never_passes():
    checks = story_bar_checks([_unit()], [_trend(None)], [_trend()])
    assert _bar(checks, "속도 누적").passed is False


@pytest.mark.parametrize("rate, passed", [(5.02, True), (5.83, False)])
def test_effective_rate_bar_accepts_the_baseline_and_rejects_the_chain(rate: float, passed: bool):
    unit = _unit(pause_ms=0, seconds=10 / rate)
    checks = story_bar_checks([unit], [_trend(0.0)], [_trend()])
    assert _bar(checks, "전체 속도").passed is passed


def test_centroid_similarity_compares_each_unit_with_the_render_average():
    embedder = IndexEmbedder([[1.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
    expected = (2 * (2 / 5**0.5) + 1 / 5**0.5) / 3
    assert centroid_similarity_mean([_unit(), _unit(), _unit()], embedder) == pytest.approx(expected)


def test_identical_units_sit_exactly_on_the_render_average():
    assert centroid_similarity_mean([_unit(), _unit()], IndexEmbedder([[0.6, 0.8], [0.6, 0.8]])) == pytest.approx(1.0)
