"""렌더 비교 설정(조건 json, 문턱 json)을 검사해 값으로 바꾼다. 파일은 읽지 않는 순수 로직이다.

조건 json: {"conditions": {"이름": ["렌더", ...] 또는 {"renders": ["렌더", ...], "reference": "s4"}}}
문턱 json: {"thresholds": {"simHead.s4": {"minDifference": 0.03, "seedNoiseMax": 0.018, "source": "근거"}}}
"""
from collections.abc import Mapping

from spike.evaluation.render_eval.render_compare import ConditionSpec, Threshold


def _is_str_list(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(v, str) for v in value)


def _field(raw: object, field: str, where: str) -> Mapping[str, object]:
    if not isinstance(raw, Mapping):
        raise ValueError(f"{where}: 최상위는 객체여야 한다")
    value = raw.get(field)
    if not isinstance(value, Mapping):
        raise ValueError(f"{where}: {field}는 객체여야 한다")
    return value


def _condition(name: str, value: object) -> ConditionSpec:
    if _is_str_list(value):
        return ConditionSpec(renders=tuple(value))
    if not isinstance(value, Mapping) or not _is_str_list(value.get("renders")):
        raise ValueError(f"조건 {name}: [렌더, ...]나 {{renders: [...], reference}} 객체여야 한다")
    reference = value.get("reference")
    if reference is not None and not isinstance(reference, str):
        raise ValueError(f"조건 {name}: reference는 문자열이어야 한다")
    return ConditionSpec(renders=tuple(value["renders"]), reference=reference)


def parse_conditions(raw: object, where: str = "조건 json") -> dict[str, ConditionSpec]:
    return {name: _condition(name, value) for name, value in _field(raw, "conditions", where).items()}


def _threshold(key: str, value: object) -> Threshold:
    numbers = ("minDifference", "seedNoiseMax")
    valid = isinstance(value, Mapping) and isinstance(value.get("source"), str) and all(
        isinstance(value.get(n), (int, float)) and not isinstance(value.get(n), bool) for n in numbers)
    if not valid:
        raise ValueError(f"문턱 {key}: minDifference·seedNoiseMax 숫자와 source 문자열이 있어야 한다")
    return Threshold(min_difference=float(value["minDifference"]), seed_noise_max=float(value["seedNoiseMax"]), source=value["source"])


def parse_thresholds(raw: object, where: str = "문턱 json") -> dict[str, Threshold]:
    return {key: _threshold(key, value) for key, value in _field(raw, "thresholds", where).items()}
