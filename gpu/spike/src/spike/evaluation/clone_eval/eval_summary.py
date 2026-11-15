"""평가 메타를 실험별로 묶어 전달받은 통과 기준과 대조한다.

운율 비율은 근거 있는 통과선이 없어 판정하지 않고 보고만 한다.
"""
from collections.abc import Callable
from dataclasses import dataclass
from operator import itemgetter
from statistics import median

DIGITS = 4
SHORT_MAX_SYLLABLES = 15


@dataclass(frozen=True)
class PassCriteria:
    """치명 오류는 원본(첫 시도) 기준만 잰다. 스파이크에는 재생성 경로가 없어 '재생성 2회 후 0.5%' 선은 제품 QC에서 본다."""
    max_median_cer: float = 0.03
    max_first_try_fatal_rate: float = 0.03
    fatal_cer: float = 0.2
    fatal_gap_sec: float = 1.5
    min_sim_ratio: float = 0.85
    max_rate_change: float = 0.10


def summarize_evaluations(meta: dict[str, dict], criteria: PassCriteria = PassCriteria()) -> dict[str, dict]:
    experiment_ids = sorted({entry["experiment"] for entry in meta.values()})
    return {eid: _experiment_summary([e for e in meta.values() if e["experiment"] == eid], criteria) for eid in experiment_ids}


def _experiment_summary(entries: list[dict], criteria: PassCriteria) -> dict:
    """동일인 게이트에서 떨어진 참조로 만든 클론은 그 화자를 잰 값이 아니라서 집계에서 빼고 개수만 보인다."""
    usable = [e for e in entries if e.get("referenceIdentityOk", True)]
    return {
        "excludedByIdentityGate": len(entries) - len(usable),
        "all": group_summary(usable, criteria) if usable else None,
        "bySentenceStyle": _grouped(usable, itemgetter("sentenceStyle"), criteria),
        "byCondition": _grouped(usable, itemgetter("condition"), criteria),
        "byLength": _grouped(usable, _length_band, criteria),
    }


def _length_band(entry: dict) -> str:
    """짧은 문장은 화자 임베딩에 쓸 소리가 적어 유사도가 낮게 나온다. 중앙값에 묻히지 않게 따로 본다."""
    return "short" if entry["syllables"] <= SHORT_MAX_SYLLABLES else "long"


def _grouped(entries: list[dict], key: Callable[[dict], str], criteria: PassCriteria) -> dict[str, dict]:
    values = sorted({key(e) for e in entries})
    return {value: group_summary([e for e in entries if key(e) == value], criteria) for value in values}


def group_summary(entries: list[dict], criteria: PassCriteria) -> dict:
    median_cer = _median_of(entries, "cer")
    first_try_fatal_rate = sum(_is_fatal(e, criteria) for e in entries) / len(entries)
    sim_ratio = _median_of(entries, "simRatio")
    rate_ratio = _median_of(entries, "rateRatio")
    return {
        "n": len(entries),
        "medianCer": median_cer,
        "firstTryFatalRate": round(first_try_fatal_rate, DIGITS),
        "fatalCauses": _fatal_cause_counts(entries, criteria),
        "medianSimRatio": sim_ratio,
        "medianRateRatio": rate_ratio,
        "medianF0RangeRatio": _median_of(entries, "f0RangeRatio"),
        "medianEnergyRatio": _median_of(entries, "energyRatio"),
        "pass": {
            "cer": _check(median_cer, lambda v: v <= criteria.max_median_cer),
            "firstTryFatal": first_try_fatal_rate <= criteria.max_first_try_fatal_rate,
            "similarity": _check(sim_ratio, lambda v: v >= criteria.min_sim_ratio),
            "rate": _check(rate_ratio, lambda v: abs(v - 1) <= criteria.max_rate_change),
        },
    }


def _is_fatal(entry: dict, criteria: PassCriteria) -> bool:
    return any(hit(entry) for hit in _fatal_causes(criteria).values())


def _fatal_causes(criteria: PassCriteria) -> dict[str, Callable[[dict], bool]]:
    """들을 수 없는 출력의 원인. EOS 없이 상한에 닿음, 전사가 크게 어긋남(잘림, 반복, 다른 말), 문장 중간에 멈춤.

    멈춤 기준 1.5초는 쉼표·문장 사이 쉼(0.3~0.8초)보다 길고, 생성이 멎었다 다시 이어지는 실패보다 짧다.
    """
    return {
        "budget": lambda e: e["hitBudget"],
        "cer": lambda e: e["cer"] >= criteria.fatal_cer,
        "gap": lambda e: e["longestGapSec"] >= criteria.fatal_gap_sec,
    }


def _fatal_cause_counts(entries: list[dict], criteria: PassCriteria) -> dict[str, int]:
    return {name: sum(map(hit, entries)) for name, hit in _fatal_causes(criteria).items()}


def _median_of(entries: list[dict], field: str) -> float | None:
    values = [e[field] for e in entries if e.get(field) is not None]
    return round(median(values), DIGITS) if values else None


def _check(value: float | None, passes: Callable[[float], bool]) -> bool | None:
    """기준 녹음이 없어 계산하지 못한 지표는 통과도 실패도 아닌 None이다."""
    return None if value is None else passes(value)
