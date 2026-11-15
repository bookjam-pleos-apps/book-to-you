"""지목된 단위마다 같은 렌더에서 짝이 되는 정상 단위를 고른다. 외부 라이브러리 없는 순수 로직이다.

지목은 짧은 외침 대사와 단위 시작에 몰린다. 아무 정상 단위나 견주면 지표가 "짧은 대사인가"만 가려도 맞는 것처럼 보인다.
그래서 style과 따옴표 시작이 같고 길이가 가장 비슷한 단위를 짝으로 고른다.
"""
import math
from collections.abc import Sequence
from functools import reduce

from spike.evaluation.eval_set.eval_set import TITLE_UNIT, Unit, text_starts_with_quote

# 길이가 0에 가까운 단위가 로그 비를 터뜨리지 않게 하는 바닥값
MIN_LENGTH_SEC = 0.1


def _same_kind(a: Unit, b: Unit) -> bool:
    return a.style == b.style and text_starts_with_quote(a.text) == text_starts_with_quote(b.text)


def _length_gap(a: Unit, b: Unit) -> float:
    return abs(math.log(max(a.duration_sec, MIN_LENGTH_SEC) / max(b.duration_sec, MIN_LENGTH_SEC)))


def match_normal(target: int, units: Sequence[Unit], excluded: frozenset[int]) -> int | None:
    """excluded(지목된 단위와 이미 고른 짝, 제목)를 뺀 같은 종류 단위 중 길이가 가장 가까운 것. 없으면 None."""
    pool = [i for i, u in enumerate(units) if i not in excluded and _same_kind(u, units[target])]
    if not pool:
        return None
    return min(pool, key=lambda i: (_length_gap(units[i], units[target]), abs(i - target)))


def match_normals(targets: Sequence[int], units: Sequence[Unit], flagged: frozenset[int]) -> tuple[int | None, ...]:
    """targets 순서대로 짝을 고르고, 고른 단위는 다음 짝 후보에서 뺀다. 같은 단위가 두 번 짝이 되지 않는다."""
    def pick(state: tuple[frozenset[int], tuple[int | None, ...]], target: int) -> tuple[frozenset[int], tuple[int | None, ...]]:
        used, chosen = state
        normal = match_normal(target, units, used)
        return (used | {normal} if normal is not None else used), chosen + (normal,)
    return reduce(pick, targets, (flagged | {TITLE_UNIT}, ()))[1]
