"""조건(같은 설정, seed만 다른 렌더 묶음)끼리 참조 기준 화자 유사도의 렌더 평균을 견준다. 합격 판정이 아니다.

문턱은 키마다 seed 잡음 근거가 달라 data/eval-compare-thresholds.json에 둔다.
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import reduce
from math import isfinite, nan
from statistics import fmean

from spike.evaluation.eval_set.eval_set import TITLE_UNIT

# 렌더 하나씩 견주면 seed 잡음에 묻힌다. 조건마다 seed가 이만큼 있어야 숫자로 읽는다.
MIN_SEEDS = 2
DEFAULT_KEY = "simHead.s4"
# 참조 기준 값만 렌더 사이에 견줄 수 있다. 렌더 평균 기준(simCentroid)과 앞 단위 기준(simPrev)은 렌더마다 기준점이 다르다.
COMPARABLE_PREFIXES = ("simHead.", "simWhole.")

BASELINE, WORSE, BETTER, WITHIN_NOISE, TOO_FEW_SEEDS = "기준", "나빠짐", "좋아짐", "잡음 안", "seed 부족"
NO_VALUE, NO_THRESHOLD, OTHER_REFERENCE = "값 없음", "문턱 없음", "참조 다름, 청취로 판정"


@dataclass(frozen=True)
class Threshold:
    min_difference: float
    seed_noise_max: float
    source: str


@dataclass(frozen=True)
class ConditionSpec:
    """reference가 None이면 참조를 적지 않은 것이다. 적은 조건과는 같은 참조로 보지 않는다."""
    renders: tuple[str, ...]
    reference: str | None = None


@dataclass(frozen=True)
class ConditionResult:
    name: str
    reference: str | None
    render_means: tuple[tuple[str, float], ...]
    mean: float
    difference: float
    verdict: str


def check_comparable_key(key: str) -> None:
    if key.startswith(COMPARABLE_PREFIXES):
        return
    raise ValueError(f"{key}는 렌더 사이 비교에 쓰지 않는다. 참조 기준 값({', '.join(COMPARABLE_PREFIXES)}...)만 견준다")


def metric_value(row: Mapping[str, object], key: str) -> float | None:
    """점으로 나눈 경로(simHead.s4)를 따라간다. 없거나 숫자가 아니거나 유한하지 않으면(NaN) None."""
    value = reduce(lambda node, part: node.get(part) if isinstance(node, Mapping) else None, key.split("."), row)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        return None
    return float(value)


def render_mean(rows: Sequence[Mapping[str, object]], render: str, key: str) -> float:
    """제목 단위(0번)는 뺀다. 렌더 행이 아예 없으면 이름 오류라 ValueError, 값이 하나도 없으면 NaN이다."""
    body = [r for r in rows if r.get("render") == render and r.get("unit") != TITLE_UNIT]
    if not body:
        raise ValueError(f"{render}: 본문 단위 행이 없다")
    present = [v for v in (metric_value(r, key) for r in body) if v is not None]
    return fmean(present) if present else nan


def judge(difference: float, seeds: int, baseline_seeds: int, threshold: Threshold | None) -> str:
    if not isfinite(difference):
        return NO_VALUE
    if min(seeds, baseline_seeds) < MIN_SEEDS:
        return TOO_FEW_SEEDS
    if threshold is None:
        return NO_THRESHOLD
    if abs(difference) < threshold.min_difference:
        return WITHIN_NOISE
    return BETTER if difference > 0 else WORSE


def _check_conditions(conditions: Mapping[str, ConditionSpec], baseline: str) -> None:
    if baseline not in conditions:
        raise ValueError(f"기준 조건 {baseline}이 조건 묶음에 없다")
    empty = [name for name, spec in conditions.items() if not spec.renders]
    if empty:
        raise ValueError(f"렌더가 없는 조건: {empty}")


def compare_conditions(rows: Sequence[Mapping[str, object]], conditions: Mapping[str, ConditionSpec], baseline: str,
                       key: str = DEFAULT_KEY, threshold: Threshold | None = None) -> list[ConditionResult]:
    """조건 평균은 렌더 평균의 평균이다. 차이는 조건 − 기준이고, 유사도라 클수록 좋다. 참조가 다르면 숫자로 판정하지 않는다."""
    check_comparable_key(key)
    _check_conditions(conditions, baseline)
    means = {name: tuple((r, render_mean(rows, r, key)) for r in spec.renders) for name, spec in conditions.items()}
    averages = {name: fmean(v for _, v in pairs) for name, pairs in means.items()}
    base = conditions[baseline]

    def verdict(name: str) -> str:
        if name == baseline:
            return BASELINE
        if conditions[name].reference != base.reference:
            return OTHER_REFERENCE
        return judge(averages[name] - averages[baseline], len(means[name]), len(means[baseline]), threshold)

    return [ConditionResult(name=name, reference=conditions[name].reference, render_means=pairs, mean=averages[name],
                            difference=averages[name] - averages[baseline], verdict=verdict(name))
            for name, pairs in means.items()]
