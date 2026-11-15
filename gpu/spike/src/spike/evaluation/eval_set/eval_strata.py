"""시험 세트 항목과 단위 지표 값으로 청취마다 층(Stratum)을 만든다. 층화 AUC(metric_agreement)의 입력이다.

지목 쪽은 그 청취의 경계 지목 단위, 비교 쪽은 그 렌더의 어느 청취에서도 지목되지 않은 단위다. 제목과 조립 실수 지목은 뺀다.
확인 청취(clip_check)는 렌더 전체를 듣지 않아 '지목 안 된 단위 = 정상'이 성립하지 않으므로 층을 만들지 않는다.
판정은 같은 청취 안의 상대 비교만 믿을 수 있어서 청취마다 따로 묶는다.
"""
from collections.abc import Mapping, Sequence
from functools import reduce

from spike.evaluation.eval_set.eval_items import Item, Observation
from spike.evaluation.eval_set.eval_set import TITLE_UNIT
from spike.evaluation.eval_set.eval_vocab import CLIP_CHECK, EXCLUDED_KINDS, Kind
from spike.evaluation.eval_set.metric_agreement import Stratum

UnitKey = tuple[str, int]


def _is_evidence(observation: Observation, kinds: frozenset[Kind] | None) -> bool:
    if observation.source == CLIP_CHECK or not observation.at_boundary or observation.kind in EXCLUDED_KINDS:
        return False
    return kinds is None or observation.kind in kinds


def _unflagged(values: Mapping[UnitKey, float], render: str, flagged: set[UnitKey]) -> tuple[float, ...]:
    return tuple(v for (r, u), v in values.items() if r == render and u != TITLE_UNIT and (r, u) not in flagged)


def listening_strata(items: Sequence[Item], values: Mapping[UnitKey, float], kinds: frozenset[Kind] | None = None) -> list[Stratum]:
    """kinds를 주면 그 종류의 지목만 지목 쪽에 넣는다. 비교 쪽은 종류와 관계없이 지목된 단위를 모두 뺀다."""
    flagged = [i for i in items if i.label == "flagged"]
    flagged_units = {(i.render, i.unit) for i in flagged}
    usable = [(i, o) for i in flagged for o in i.observations if _is_evidence(o, kinds)]
    render_of = {o.listening: i.render for i, o in usable}
    return [
        Stratum(tuple(values[(i.render, i.unit)] for i, o in usable if o.listening == listening), _unflagged(values, render, flagged_units))
        for listening, render in render_of.items()
    ]


def _child(node: object, key: str) -> object:
    return node.get(key) if isinstance(node, dict) else None


def metric_value(row: object, path: Sequence[str]) -> float:
    """"simHead.s4"처럼 점으로 나눈 경로의 숫자. 없거나 null이면 NaN이라 AUC에서 빠진다."""
    found = reduce(_child, path, row)
    if isinstance(found, bool) or not isinstance(found, int | float):
        return float("nan")
    return float(found)


def _unit_key(row: object) -> UnitKey:
    render, unit = _child(row, "render"), _child(row, "unit")
    if not isinstance(render, str) or isinstance(unit, bool) or not isinstance(unit, int):
        raise ValueError(f"단위 지표 행에 render와 unit이 없다: {row!r}"[:120])
    return render, unit


def unit_values(rows: Sequence[object], key: str, higher_is_better: bool) -> dict[UnitKey, float]:
    """높을수록 좋은 지표는 부호를 뒤집어 "나쁠수록 큰 값"으로 맞춘다. 방향은 측정 전에 정한다."""
    sign = -1.0 if higher_is_better else 1.0
    path = key.split(".")
    return {_unit_key(row): sign * metric_value(row, path) for row in rows}
