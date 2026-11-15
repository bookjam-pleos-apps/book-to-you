"""경계 클립과 대조 클립을 섞어 듣기 파일 하나로 잇는다. 사람이 조건을 모르고 듣게 하는 순수 로직이다."""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from itertools import accumulate
from random import Random
from typing import Literal

import numpy as np

from spike.sound.audio import Audio
from spike.listening.mark_time import mark_seconds
from spike.sound.speech_activity import speech_bounds

BOUNDARY_SIDE_SEC = 3.0
CONTROL_SEC = 7.0
MIN_CONTROL_SPEECH_SEC = 2 * BOUNDARY_SIDE_SEC + CONTROL_SEC
CONTROL_COUNT = 10
FADE_SEC = 0.02
BEEP_SEC = 0.2
BEEP_HZ = 880.0
BEEP_LEVEL = 0.1
GAP_SEC = 2.0
AMBIGUOUS_SEC = 1.5


@dataclass(frozen=True)
class SpeechSpan:
    start: int
    end: int


@dataclass(frozen=True)
class Clip:
    kind: Literal["boundary", "control"]
    unit: int
    start: int
    end: int


@dataclass(frozen=True)
class PlacedClip:
    clip: Clip
    at: int


def _span(index: int, unit: Audio, start: int) -> SpeechSpan:
    bounds = speech_bounds(unit)
    if bounds is None:
        raise ValueError(f"단위 {index}에 말소리가 없어 클립 번호를 정할 수 없습니다")
    return SpeechSpan(start + bounds[0], start + bounds[1])


def speech_spans(units: Sequence[Audio], starts: Sequence[int]) -> list[SpeechSpan]:
    return [_span(index, unit, start) for index, (unit, start) in enumerate(zip(units, starts))]


def boundary_clips(spans: Sequence[SpeechSpan], rate: int) -> list[Clip]:
    """이야기 시간축에서 그대로 잘라 실제 쉼을 유지한다. 단위 번호는 경계 뒤쪽 묶음이다."""
    side = int(rate * BOUNDARY_SIDE_SEC)
    return [
        Clip("boundary", index + 1, max(before.start, before.end - side), min(after.end, after.start + side))
        for index, (before, after) in enumerate(zip(spans, spans[1:]))
    ]


def _middle_clip(unit: int, span: SpeechSpan, length: int) -> Clip:
    start = (span.start + span.end - length) // 2
    return Clip("control", unit, start, start + length)


def control_clips(spans: Sequence[SpeechSpan], rate: int, first_unit: int, rng: Random) -> list[Clip]:
    """주 분석 경계와 조건이 같도록 아직 듣지 않은 묶음에서 고른다. 경계 클립과 겹치지 않을 만큼 긴 묶음만 쓴다."""
    least = int(rate * MIN_CONTROL_SPEECH_SEC)
    eligible = [index for index, span in enumerate(spans) if index >= first_unit and span.end - span.start >= least]
    if len(eligible) < CONTROL_COUNT:
        raise ValueError(f"대조 후보가 {len(eligible)}개라 {CONTROL_COUNT}개를 고를 수 없습니다")
    length = int(rate * CONTROL_SEC)
    return [_middle_clip(index, spans[index], length) for index in sorted(rng.sample(eligible, CONTROL_COUNT))]


def shuffled(clips: Sequence[Clip], rng: Random) -> list[Clip]:
    return rng.sample(list(clips), len(clips))


def separator_length(rate: int) -> int:
    return int(rate * BEEP_SEC) + int(rate * GAP_SEC)


def place_clips(clips: Sequence[Clip], lead_length: int, rate: int) -> list[PlacedClip]:
    """맨 앞 참조 음성과 신호음 뒤부터 클립을 놓는다. 위치는 샘플로 세어 뒤로 갈수록 어긋나지 않게 한다."""
    step = separator_length(rate)
    lengths = [clip.end - clip.start + step for clip in clips]
    return [PlacedClip(clip, at) for clip, at in zip(clips, accumulate(lengths, initial=lead_length + step))]


def clip_at(placed: Sequence[PlacedClip], sample: int, rate: int) -> PlacedClip | None:
    """신호음과 무음 구간은 방금 들은 클립에 붙인다. 듣고 나서 시각을 적는 사이에도 시간이 흐르기 때문이다."""
    last = placed[-1]
    if sample >= last.at + last.clip.end - last.clip.start + separator_length(rate):
        return None
    return next((item for item in reversed(placed) if item.at <= sample), None)


def near_clip_change(placed: Sequence[PlacedClip], sample: int, rate: int) -> bool:
    """클립이 바뀌는 순간 근처의 지목은 앞뒤 어느 클립을 가리키는지 알 수 없다. 시각도 초 단위로만 적힌다."""
    window = int(rate * AMBIGUOUS_SEC)
    return any(abs(sample - item.at) <= window for item in placed)


def seconds_of_mark(mark: str) -> int:
    """클립 지목은 초 단위로 적고 샘플 위치로 곱해 쓰므로 정수 초로 내린다."""
    return int(mark_seconds(mark))


def clock(seconds: float) -> str:
    return f"{int(seconds) // 60}:{int(seconds) % 60:02d}"


def placed_from_key(line: Mapping) -> PlacedClip:
    return PlacedClip(Clip(**line["clip"]), line["at"])


def _faded(samples: np.ndarray, rate: int) -> np.ndarray:
    """말 도중에 자른 끝이 딸깍 소리로 들려 판단을 흐리지 않게 한다. 경계의 쉼은 건드리지 않는다."""
    ramp_length = min(int(rate * FADE_SEC), len(samples) // 2)
    envelope = np.ones(len(samples), dtype=np.float32)
    ramp = np.linspace(0.0, 1.0, ramp_length, dtype=np.float32)
    envelope[:ramp_length] = ramp
    envelope[len(samples) - ramp_length:] = ramp[::-1]
    return samples * envelope


def _separator(rate: int) -> np.ndarray:
    times = np.arange(int(rate * BEEP_SEC)) / rate
    beep = (BEEP_LEVEL * np.sin(2 * np.pi * BEEP_HZ * times)).astype(np.float32)
    return np.concatenate([_faded(beep, rate), np.zeros(int(rate * GAP_SEC), dtype=np.float32)])


def listening_track(story: Audio, placed: Sequence[PlacedClip], lead: np.ndarray) -> Audio:
    rate = story.sample_rate
    separator = _separator(rate)
    clips = [_faded(story.samples[item.clip.start:item.clip.end], rate) for item in placed]
    parts = [part for samples in clips for part in (samples, separator)]
    return Audio(np.concatenate([_faded(lead, rate), separator, *parts]), rate)
