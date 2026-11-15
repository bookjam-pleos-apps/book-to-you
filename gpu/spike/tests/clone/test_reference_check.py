import numpy as np
import pytest

from fakes import SAMPLE_RATE, silence, tone
from spike.sound.audio import Audio
from spike.clone.reference.reference_check import CHANGES, ReferenceMeasure, noise_margin_db, speech_rate, style_problems
from spike.clone.reference.style_checks import METRICS, Bound, StyleCheck, load_style_checks

CHECKS = {check.style: check for check in load_style_checks()}
UNMEASURED = ReferenceMeasure("any", None, None, None, None)


def _recording(edge: np.ndarray, speech_sec: float = 2.0) -> Audio:
    return Audio(np.concatenate([edge, tone(level=0.5, sec=speech_sec), edge]), SAMPLE_RATE)


def _measure(style: str, rate: float, semitones: float, spread: float = 6.0) -> ReferenceMeasure:
    return ReferenceMeasure(style, rate, semitones, spread, 30.0)


def _problems(style: str, calm: ReferenceMeasure, measure: ReferenceMeasure) -> list[str]:
    return style_problems(CHECKS[style], calm, measure)


def test_rate_leaves_out_the_silence_around_the_reading():
    assert speech_rate(_recording(silence(1.0)), syllables=10) == pytest.approx(5.0, rel=0.02)


def test_noise_margin_compares_speech_with_the_silence_around_it():
    assert noise_margin_db(_recording(tone(level=0.005, sec=1.0))) == pytest.approx(40.0, abs=1.0)


def test_noise_margin_is_unknown_without_enough_silence_around_the_reading():
    assert noise_margin_db(_recording(silence(0.1))) is None


def test_soft_that_is_lower_and_slower_than_calm_passes():
    assert _problems("soft", _measure("calm", 4.24, 100.0, 7.1), _measure("soft", 3.60, 99.0, 5.1)) == []


def test_soft_that_reads_like_calm_is_sent_back():
    assert _problems("soft", _measure("calm", 4.24, 100.0), _measure("soft", 4.24, 100.0))


def test_soft_that_is_only_slower_still_passes():
    assert _problems("soft", _measure("calm", 4.62, 100.0), _measure("soft", 3.88, 100.1)) == []


def test_soft_that_is_only_lower_still_passes():
    assert _problems("soft", _measure("calm", 4.24, 100.0), _measure("soft", 4.24, 99.5)) == []


def test_deep_two_semitones_below_calm_passes():
    assert _problems("deep", _measure("calm", 6.25, 12.92), _measure("deep", 5.23, 10.62)) == []


def test_deep_close_to_calm_is_sent_back():
    assert _problems("deep", _measure("calm", 6.25, 12.92), _measure("deep", 5.23, 11.5))


def test_child_four_and_a_half_semitones_above_calm_passes():
    assert _problems("child", _measure("calm", 6.25, 12.92), _measure("child", 5.6, 17.42)) == []


def test_child_exactly_at_the_rise_passes():
    assert _problems("child", _measure("calm", 6.0, 12.0), _measure("child", 5.0, 15.0)) == []


def test_child_close_to_calm_is_sent_back():
    assert _problems("child", _measure("calm", 6.25, 12.92), _measure("child", 5.6, 14.9))


def test_child_below_calm_is_sent_back():
    assert _problems("child", _measure("calm", 6.25, 12.92), _measure("child", 5.6, 8.0))


@pytest.mark.parametrize("style", sorted(CHECKS))
def test_a_style_that_cannot_be_measured_is_sent_back(style: str):
    assert _problems(style, _measure("calm", 6.25, 12.92), UNMEASURED)


@pytest.mark.parametrize("style", sorted(CHECKS))
def test_a_style_cannot_pass_against_an_unmeasured_calm(style: str):
    assert _problems(style, UNMEASURED, _measure(style, 1.0, 40.0))


def test_a_new_style_needs_only_data():
    whisper = StyleCheck("whisper", (Bound("speechRateChange", at_least=0.1),))

    assert style_problems(whisper, _measure("calm", 5.0, 12.0), _measure("whisper", 5.5, 12.0)) == []
    assert style_problems(whisper, _measure("calm", 5.0, 12.0), _measure("whisper", 5.2, 12.0)) == [
        "calm과 구별되지 않습니다. calm 대비 기준: 말 속도 +10% 이상"
    ]


def test_the_reason_lists_every_way_to_pass():
    assert _problems("soft", _measure("calm", 4.24, 100.0), _measure("soft", 4.24, 100.0)) == [
        "calm과 구별되지 않습니다. calm 대비 기준: 말 속도 -5% 이하 또는 음높이 -0.5반음 이하"
    ]


def test_every_metric_in_the_data_can_be_measured():
    assert set(CHANGES) == set(METRICS)
