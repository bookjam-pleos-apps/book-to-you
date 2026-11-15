"""지표가 사용자 청취 지목과 얼마나 맞는지 잰다. 외부 라이브러리는 numpy만 쓴다.

판정은 같은 청취 안의 상대 비교만 믿을 수 있어서, AUC는 청취마다 따로 세고 쌍 수로 가중해 합친다(층화 AUC).
방향은 미리 정한다. "나쁠수록 커지는" 값으로 넘겨야 하고, 0.5 아래는 지표가 귀와 반대로 움직인다는 뜻이다.
"""
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

TRUSTED_AUC, WEAK_AUC, OPPOSITE_AUC = 0.70, 0.60, 0.40
BOOTSTRAP_ROUNDS = 1000


@dataclass(frozen=True)
class Stratum:
    flagged: tuple[float, ...]
    others: tuple[float, ...]


@dataclass(frozen=True)
class Agreement:
    auc: float
    low: float
    high: float
    pairs: int


def pair_wins(flagged: Sequence[float], others: Sequence[float]) -> tuple[float, int]:
    """지목된 값이 지목 안 된 값보다 큰 쌍의 수(같으면 0.5)와 전체 쌍 수. NaN은 뺀다."""
    f = np.array([x for x in flagged if np.isfinite(x)])
    o = np.array([x for x in others if np.isfinite(x)])
    if f.size == 0 or o.size == 0:
        return 0.0, 0
    diff = f[:, None] - o[None, :]
    return float((diff > 0).sum() + 0.5 * (diff == 0).sum()), int(diff.size)


def stratified_auc(strata: Sequence[Stratum]) -> tuple[float, int]:
    totals = [pair_wins(s.flagged, s.others) for s in strata]
    wins, pairs = sum(t[0] for t in totals), sum(t[1] for t in totals)
    return (wins / pairs if pairs else float("nan")), pairs


def _resampled(stratum: Stratum, rng: np.random.Generator) -> Stratum:
    pick = lambda values: tuple(rng.choice(values, size=len(values))) if values else ()
    return Stratum(pick(stratum.flagged), pick(stratum.others))


def agreement(strata: Sequence[Stratum], seed: int = 0) -> Agreement:
    """층화 AUC와, 청취마다 지목·비지목을 따로 다시 뽑은 부트스트랩 95% 구간."""
    auc, pairs = stratified_auc(strata)
    rng = np.random.default_rng(seed)
    samples = [stratified_auc([_resampled(s, rng) for s in strata])[0] for _ in range(BOOTSTRAP_ROUNDS)]
    finite = [x for x in samples if np.isfinite(x)]
    if not finite:
        return Agreement(auc, float("nan"), float("nan"), pairs)
    return Agreement(auc, float(np.percentile(finite, 2.5)), float(np.percentile(finite, 97.5)), pairs)


def verdict(result: Agreement) -> str:
    if not np.isfinite(result.auc):
        return "판정 불가"
    if result.auc >= TRUSTED_AUC and result.low > 0.5:
        return "믿을 만함"
    if result.auc <= OPPOSITE_AUC and result.high < 0.5:
        return "귀와 반대"
    if result.auc >= WEAK_AUC:
        return "약함"
    return "못 믿음"
