"""같은 경계를 두 렌더에서 잘라 쌍으로 놓는다. 쌍 안의 순서만 무작위라 듣는 사람이 어느 쪽인지 모른다. 순수 로직."""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from random import Random

import numpy as np

from spike.sound.audio import Audio
from spike.listening.listening_plan import SpeechSpan

FIRST_BOUNDARY = 1


@dataclass(frozen=True)
class PairPlan:
    boundaries: tuple[int, ...]
    side_sec: float
    seed: int


@dataclass(frozen=True)
class PairSlot:
    pair: int
    unit: int
    condition: str


def parse_pair_plan(raw: Mapping) -> PairPlan:
    """첫 묶음 앞에는 경계가 없다. 번호 0은 오류 없이 마지막 묶음을 읽으므로 여기서 막는다."""
    if min(raw["boundaries"]) < FIRST_BOUNDARY:
        raise ValueError(f"경계 번호가 잘못되었습니다: {raw['boundaries']}")
    return PairPlan(tuple(raw["boundaries"]), raw["sideSec"], raw["seed"])


def boundary_samples(story: Audio, spans: Sequence[SpeechSpan], boundary: int, side_sec: float) -> np.ndarray:
    """앞 묶음 끝과 실제 쉼과 다음 묶음 처음을 들은 파일에서 그대로 자른다. 묶음이 짧으면 그 묶음만큼만 쓴다."""
    side = int(story.sample_rate * side_sec)
    before, after = spans[boundary - 1], spans[boundary]
    return story.samples[max(before.start, before.end - side):min(after.end, after.start + side)]


def _first_conditions(count: int, conditions: tuple[str, str], rng: Random) -> list[str]:
    """앞 클립 조건의 개수를 맞춰 섞는다. 쌍마다 동전을 던지면 한쪽에 몰리거나 번갈아 나와 순서로 조건을 짐작할 수 있다."""
    first, second = conditions
    return rng.sample([first] * (count // 2) + [second] * (count - count // 2), count)


def _ordered_pair(pair: int, unit: int, first: str, conditions: tuple[str, str]) -> list[PairSlot]:
    second = conditions[1] if first == conditions[0] else conditions[0]
    return [PairSlot(pair, unit, first), PairSlot(pair, unit, second)]


def pair_slots(plan: PairPlan, conditions: tuple[str, str]) -> list[PairSlot]:
    firsts = _first_conditions(len(plan.boundaries), conditions, Random(plan.seed))
    return [
        slot
        for pair, (unit, first) in enumerate(zip(plan.boundaries, firsts))
        for slot in _ordered_pair(pair, unit, first, conditions)
    ]
