from random import Random

import numpy as np
import pytest

from spike.sound.audio import Audio
from spike.listening.listening_plan import (
    BOUNDARY_SIDE_SEC,
    CONTROL_COUNT,
    CONTROL_SEC,
    Clip,
    PlacedClip,
    SpeechSpan,
    boundary_clips,
    clip_at,
    clock,
    control_clips,
    listening_track,
    near_clip_change,
    place_clips,
    placed_from_key,
    seconds_of_mark,
    separator_length,
    shuffled,
    speech_spans,
)

RATE = 1000


def _seconds(value: float) -> int:
    return int(value * RATE)


def _long_spans(count: int) -> list[SpeechSpan]:
    """20초짜리 말소리 사이에 1초 쉼이 있는 이야기."""
    return [SpeechSpan(_seconds(21 * index), _seconds(21 * index + 20)) for index in range(count)]


def _clip(unit: int, start: int, end: int) -> Clip:
    return Clip("boundary", unit, start, end)


def _ordered_story(length: int) -> Audio:
    return Audio(np.linspace(0.1, 0.5, length, dtype=np.float32), RATE)


def test_speech_spans_are_placed_on_the_story_timeline():
    silence, speech = np.zeros(_seconds(0.2), dtype=np.float32), np.full(_seconds(1), 0.3, dtype=np.float32)
    unit = Audio(np.concatenate([silence, speech, silence]), RATE)
    [first, second] = speech_spans([unit, unit], [0, 5000])
    assert (first.start, first.end) == (200, 1200)
    assert (second.start, second.end) == (5200, 6200)


def test_unit_without_speech_stops_the_plan_instead_of_shifting_numbers():
    silent = Audio(np.zeros(RATE, dtype=np.float32), RATE)
    with pytest.raises(ValueError, match="단위 0"):
        speech_spans([silent], [0])


def test_boundary_clip_spans_tail_actual_pause_and_head():
    spans = _long_spans(3)
    clips = boundary_clips(spans, RATE)
    assert [clip.unit for clip in clips] == [1, 2]
    assert clips[0] == Clip("boundary", 1, spans[0].end - _seconds(BOUNDARY_SIDE_SEC), spans[1].start + _seconds(BOUNDARY_SIDE_SEC))


def test_boundary_clip_stays_inside_short_units():
    spans = [SpeechSpan(0, _seconds(1)), SpeechSpan(_seconds(2), _seconds(4))]
    [clip] = boundary_clips(spans, RATE)
    assert (clip.start, clip.end) == (0, _seconds(4))


def test_control_clips_sit_in_the_middle_of_one_unheard_long_unit():
    spans = _long_spans(CONTROL_COUNT + 3)
    clips = control_clips(spans, RATE, first_unit=3, rng=Random(1))
    assert len(clips) == CONTROL_COUNT
    assert all(clip.unit >= 3 for clip in clips)
    assert all(clip.end - clip.start == _seconds(CONTROL_SEC) for clip in clips)
    assert all(spans[clip.unit].start < clip.start and clip.end < spans[clip.unit].end for clip in clips)
    assert clips[0].start - spans[clips[0].unit].start == spans[clips[0].unit].end - clips[0].end


def test_control_clips_skip_short_units():
    spans = [*_long_spans(CONTROL_COUNT), SpeechSpan(_seconds(300), _seconds(305))]
    clips = control_clips(spans, RATE, first_unit=0, rng=Random(1))
    assert CONTROL_COUNT not in [clip.unit for clip in clips]


def test_too_few_control_candidates_is_an_error():
    with pytest.raises(ValueError, match="대조"):
        control_clips(_long_spans(CONTROL_COUNT), RATE, first_unit=1, rng=Random(1))


def test_shuffle_loses_nothing_and_repeats_with_the_same_seed():
    clips = [_clip(index, index, index + 1) for index in range(35)]
    mixed = shuffled(clips, Random(7))
    assert mixed != clips
    assert sorted(mixed, key=lambda clip: clip.unit) == clips
    assert mixed == shuffled(clips, Random(7))


def test_placed_clips_never_overlap_and_are_separated():
    clips = [_clip(1, 0, 500), _clip(2, 1000, 1800), _clip(3, 2000, 2300)]
    placed = place_clips(clips, lead_length=400, rate=RATE)
    gap = separator_length(RATE)
    assert [item.at for item in placed] == [400 + gap, 400 + gap + 500 + gap, 400 + gap + 500 + gap + 800 + gap]


def test_track_length_and_clip_positions_match_the_plan():
    story = _ordered_story(_seconds(30))
    clips = [_clip(1, 5000, 8000), _clip(2, 1000, 3000)]
    lead = np.full(400, 0.2, dtype=np.float32)
    placed = place_clips(clips, len(lead), RATE)
    track = listening_track(story, placed, lead)
    assert len(track.samples) == placed[-1].at + 2000 + separator_length(RATE)
    assert track.sample_rate == RATE
    middle = placed[0].at + 1500
    assert track.samples[middle] == story.samples[5000 + 1500]


def test_clip_edges_fade_but_the_inside_is_untouched():
    story = Audio(np.full(_seconds(10), 0.4, dtype=np.float32), RATE)
    placed = place_clips([_clip(1, 0, 3000)], 0, RATE)
    samples = listening_track(story, placed, np.zeros(0, dtype=np.float32)).samples
    start = placed[0].at
    assert samples[start] == pytest.approx(0.0)
    assert samples[start + 3000 - 1] == pytest.approx(0.0)
    assert np.all(samples[start + 100:start + 2900] == pytest.approx(0.4))


def _two_placed() -> list[PlacedClip]:
    return place_clips([_clip(1, 0, 1000), _clip(2, 2000, 3000)], 500, RATE)


def test_time_inside_a_clip_finds_that_clip():
    [first, second] = _two_placed()
    assert clip_at([first, second], first.at + 10, RATE) == first
    assert clip_at([first, second], second.at, RATE) == second


def test_time_in_the_gap_belongs_to_the_clip_just_heard():
    [first, second] = _two_placed()
    assert clip_at([first, second], second.at - 1, RATE) == first


def test_time_outside_the_clips_finds_nothing():
    placed = _two_placed()
    assert clip_at(placed, placed[0].at - 1, RATE) is None
    assert clip_at(placed, placed[-1].at + 1000 + separator_length(RATE), RATE) is None


def test_mark_reads_minutes_and_seconds():
    assert seconds_of_mark("1:32") == 92


def test_clock_is_the_inverse_of_a_mark():
    assert clock(92.9) == "1:32"
    assert clock(5) == "0:05"


def test_placed_clip_comes_back_from_the_key():
    assert placed_from_key({"clip": {"kind": "control", "unit": 3, "start": 10, "end": 20}, "at": 500}) == PlacedClip(Clip("control", 3, 10, 20), 500)


def test_marks_around_a_clip_change_are_unclear_but_mid_clip_is_not():
    [first, second] = place_clips([_clip(1, 0, 7000), _clip(2, 8000, 15000)], 500, RATE)
    assert near_clip_change([first, second], second.at - _seconds(1), RATE)
    assert near_clip_change([first, second], second.at + _seconds(1), RATE)
    assert not near_clip_change([first, second], first.at + _seconds(4), RATE)


def test_units_too_short_to_avoid_boundary_clips_are_not_controls():
    spans = [*_long_spans(CONTROL_COUNT), SpeechSpan(_seconds(300), _seconds(312.5))]
    clips = control_clips(spans, RATE, first_unit=0, rng=Random(1))
    assert CONTROL_COUNT not in [clip.unit for clip in clips]


def test_control_clips_never_overlap_boundary_clips():
    spans = [SpeechSpan(_seconds(14 * index), _seconds(14 * index + 13)) for index in range(CONTROL_COUNT + 1)]
    edges = boundary_clips(spans, RATE)
    controls = control_clips(spans, RATE, first_unit=0, rng=Random(1))
    assert not any(edge.start < control.end and control.start < edge.end for edge in edges for control in controls)
