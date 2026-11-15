import numpy as np
import pytest

from spike.sound.audio import Audio
from spike.compose.parity_check import (
    ClipMetrics,
    ParityLimits,
    clip_metrics,
    limit_violations,
    mean_speed_gap,
    parity_passed,
    pcm16,
    same_pcm16,
    transcriber_violations,
    unknown_ids,
)

RATE = 24000


def audio(*samples: float) -> Audio:
    return Audio(np.array(samples, dtype=np.float32), RATE)


def speed(syllables_per_sec: float) -> ClipMetrics:
    return ClipMetrics(1.0, syllables_per_sec, 0.0)


def test_pcm16_clips_full_scale_without_wrapping():
    assert pcm16(np.array([1.0, -1.0, 2.0], dtype=np.float32)).tolist() == [32767, -32768, 32767]


def test_float_result_matches_its_decoded_service_reply():
    direct = audio(0.1234, -0.5, 0.75)
    decoded = Audio(pcm16(direct.samples).astype(np.float32) / 32768, RATE)

    assert same_pcm16(direct, decoded)


def test_a_one_step_difference_is_not_the_same_clip():
    assert not same_pcm16(audio(0.5), audio(0.5 + 1 / 32768))


def test_other_sample_rate_is_not_the_same_clip():
    assert not same_pcm16(audio(0.5), Audio(np.array([0.5], dtype=np.float32), 16000))


def test_clip_metrics_counts_hangul_syllables_per_second():
    metrics = clip_metrics(Audio(np.zeros(RATE * 2, dtype=np.float32), RATE), "안녕 하세요!", "안녕 하세요!")

    assert metrics == ClipMetrics(2.0, 2.5, 0.0)


def test_mean_speed_gap_is_relative_to_direct_calls():
    assert mean_speed_gap([speed(4.0), speed(6.0)], [speed(5.5), speed(5.5)]) == pytest.approx(0.1)


def test_empty_audio_cannot_be_measured():
    with pytest.raises(ValueError):
        clip_metrics(Audio(np.zeros(0, dtype=np.float32), RATE), "안녕", "")


@pytest.mark.parametrize(
    ("compose", "expected"),
    [
        (ClipMetrics(10.5, 5.0, 0.12), []),
        (ClipMetrics(10.6, 5.0, 0.10), ["duration"]),
        (ClipMetrics(9.4, 5.0, 0.10), ["duration"]),
        (ClipMetrics(10.0, 5.0, 0.13), ["cer"]),
        (ClipMetrics(10.0, 5.0, 0.07), ["cer"]),
        (ClipMetrics(11.0, 5.0, 0.20), ["duration", "cer"]),
    ],
)
def test_limit_violations_name_each_gap_past_its_limit(compose: ClipMetrics, expected: list[str]):
    limits = ParityLimits(max_duration_gap=0.055, max_cer_gap=0.025)

    assert limit_violations(ClipMetrics(10.0, 5.0, 0.10), compose, limits) == expected


@pytest.mark.parametrize(
    ("matches", "violations", "speed_gap", "expected"),
    [
        ([True], [[], []], 0.03, True),
        ([True, False], [[]], 0.0, False),
        ([True], [[], ["cer"]], 0.0, False),
        ([True], [[]], 0.031, False),
    ],
)
def test_parity_passes_only_when_every_check_does(matches: list[bool], violations: list[list[str]], speed_gap: float, expected: bool):
    assert parity_passed(matches, violations, speed_gap, ParityLimits()) is expected


def test_unknown_ids_lists_only_missing_sentences():
    assert unknown_ids(["t02", "t99", "t01"], ["t01", "t02"]) == ["t99"]


def test_a_wrong_compose_transcript_is_a_violation():
    direct = ClipMetrics(10.0, 5.0, 0.0)

    assert transcriber_violations(direct, ClipMetrics(10.0, 5.0, 0.5), ParityLimits()) == ["transcriber_cer"]
    assert transcriber_violations(direct, direct, ParityLimits()) == []
