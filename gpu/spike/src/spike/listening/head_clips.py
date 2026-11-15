"""저장한 앞 묶음 끝에 새로 만든 앞부분을 이어 듣기 클립을 만들고, 지목 결과를 합격선과 견준다. 순수 로직."""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from itertools import accumulate

import numpy as np

from spike.sound.audio import Audio
from spike.sound.audio_level import leveled
from spike.listening.listening_plan import BOUNDARY_SIDE_SEC, Clip, SpeechSpan
from spike.sound.speech_activity import speech_bounds

CURRENT = "current"
CHAIN = "chain"
PASS_MARGIN = 0.30
JUNCTION_UNIT = 5
HEAD_WINDOW_SEC = 4.0


@dataclass(frozen=True)
class HeadMark:
    condition: str
    unit: int
    seed: int
    flagged: bool


@dataclass(frozen=True)
class ChainVerdict:
    current_rate: float
    chain_rate: float
    early_seed_drop: float
    late_seed_drop: float
    passed: bool


def require_late_junctions(records: Sequence[Mapping]) -> None:
    """디코더 접합부가 앞부분에 걸리면 체이닝 탓과 구분되지 않는다. 판정에서 빼기로 한 5번만 허용한다."""
    early = sorted({
        record["unit"]
        for record in records
        if record["unit"] != JUNCTION_UNIT and record["junctionSec"] is not None and record["junctionSec"] < HEAD_WINDOW_SEC
    })
    if early:
        raise ValueError(f"접합부가 앞 {HEAD_WINDOW_SEC}초 안에 오는 묶음이 있습니다: {early}")


def head_clip_samples(story: Audio, previous: SpeechSpan, unit_start: int, head: Audio) -> np.ndarray:
    """앞 묶음 끝과 실제 쉼은 저장된 소리 그대로 두어 조건 차이만 남긴다. 말소리 처음 3초까지 쓴다."""
    bounds = speech_bounds(head)
    if bounds is None:
        raise ValueError("새로 만든 앞부분에 말소리가 없습니다")
    side = int(story.sample_rate * BOUNDARY_SIDE_SEC)
    tail = story.samples[max(previous.start, previous.end - side):unit_start]
    return np.concatenate([tail, leveled(head.samples)[:bounds[0] + side]])


def pooled_clips(samples: Sequence[np.ndarray], units: Sequence[int], rate: int) -> tuple[Audio, list[Clip]]:
    """클립 소리를 한 줄로 이어 기존 배치와 시각 대응을 그대로 쓴다. 모든 클립이 경계라 종류는 boundary다."""
    ends = list(accumulate(len(part) for part in samples))
    clips = [Clip("boundary", unit, start, end) for unit, start, end in zip(units, [0, *ends[:-1]], ends)]
    return Audio(np.concatenate(samples), rate), clips


def flag_rate(marks: Sequence[HeadMark]) -> float:
    if not marks:
        raise ValueError("지목률을 낼 클립이 없습니다")
    return sum(mark.flagged for mark in marks) / len(marks)


def _drop(marks: Sequence[HeadMark]) -> float:
    current = [mark for mark in marks if mark.condition == CURRENT]
    chain = [mark for mark in marks if mark.condition == CHAIN]
    return flag_rate(current) - flag_rate(chain)


def chain_verdict(marks: Sequence[HeadMark]) -> ChainVerdict:
    """합격선은 계획에 고정된 값이다. 5번은 접합부가 앞부분에 걸려 판정에서 빼고 따로 본다."""
    main = [mark for mark in marks if mark.unit != JUNCTION_UNIT]
    seeds = sorted({mark.seed for mark in main})
    early_seeds = set(seeds[:len(seeds) // 2])
    early = _drop([mark for mark in main if mark.seed in early_seeds])
    late = _drop([mark for mark in main if mark.seed not in early_seeds])
    current = flag_rate([mark for mark in main if mark.condition == CURRENT])
    chain = flag_rate([mark for mark in main if mark.condition == CHAIN])
    return ChainVerdict(current, chain, early, late, current - chain >= PASS_MARGIN and early > 0 and late > 0)
