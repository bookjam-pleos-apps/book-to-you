"""시험 세트 항목과 버전 파일의 행(camelCase json)을 서로 바꾼다. 외부 라이브러리 없는 순수 로직이다.

되읽을 때는 json 값을 타입마다 확인한다. 세트 파일을 손으로 고쳐도 틀린 값이 지표 계산까지 흘러가지 않게 한다.
"""
from collections.abc import Mapping
from dataclasses import asdict

from spike.evaluation.eval_set.eval_items import Item, Observation, Render
from spike.evaluation.eval_set.eval_vocab import LISTENING, Confirmation, Kind, Label, Source, Tier, is_confirmation, is_kind, is_label, is_source, is_tier

# 기본값인 새 필드는 행에 쓰지 않는다. 확인 청취 전 버전(v1)의 행과 같게 남아 버전 차이에 잡음이 생기지 않는다.
ITEM_DEFAULTS: dict[str, object] = {"confirmation": None}
OBSERVATION_DEFAULTS: dict[str, object] = {"source": LISTENING}


def item_row(item: Item, render: Render, files: Mapping[str, str]) -> dict[str, object]:
    unit = render.units[item.unit]
    observations = [_without_defaults(_camel_keys(asdict(o)), OBSERVATION_DEFAULTS) | {"file": files[o.listening]} for o in item.observations]
    head = _without_defaults(_camel_keys({k: v for k, v in asdict(item).items() if k != "observations"}), ITEM_DEFAULTS)
    return head | {"text": unit.text, "style": unit.style, "durationSec": round(unit.duration_sec, 3), "audio": render.audio[item.unit], "observations": observations}


def _without_defaults(row: Mapping[str, object], defaults: Mapping[str, object]) -> dict[str, object]:
    return {k: v for k, v in row.items() if not (k in defaults and v == defaults[k])}


def _camel_keys(row: Mapping[str, object]) -> dict[str, object]:
    return {_camel(k): v for k, v in row.items()}


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(w.title() for w in rest)


def _text(row: Mapping[str, object], key: str, where: str) -> str:
    value = row.get(key)
    if not isinstance(value, str):
        raise ValueError(f"{where}: {key}가 문자열이 아니다({value!r})")
    return value


def _flag(row: Mapping[str, object], key: str, where: str) -> bool:
    value = row.get(key)
    if not isinstance(value, bool):
        raise ValueError(f"{where}: {key}가 참거짓이 아니다({value!r})")
    return value


def _whole(row: Mapping[str, object], key: str, where: str) -> int:
    value = row.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{where}: {key}가 정수가 아니다({value!r})")
    return value


def _number(row: Mapping[str, object], key: str, where: str) -> float:
    value = row.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError(f"{where}: {key}가 숫자가 아니다({value!r})")
    return float(value)


def _kind(value: object, where: str) -> Kind:
    if not is_kind(value):
        raise ValueError(f"{where}: 모르는 지목 종류 {value!r}")
    return value


def _label(value: object, where: str) -> Label:
    if not is_label(value):
        raise ValueError(f"{where}: 모르는 항목 라벨 {value!r}")
    return value


def _tier(value: object, where: str) -> Tier:
    if not is_tier(value):
        raise ValueError(f"{where}: 모르는 층 {value!r}")
    return value


def _source(value: object, where: str) -> Source:
    if value is None:
        return LISTENING
    if not is_source(value):
        raise ValueError(f"{where}: 모르는 관찰 출처 {value!r}")
    return value


def _confirmation(value: object, where: str) -> Confirmation | None:
    if value is None:
        return None
    if not is_confirmation(value):
        raise ValueError(f"{where}: 모르는 확인 결과 {value!r}")
    return value


def _observation(raw: object, where: str) -> Observation:
    if not isinstance(raw, dict):
        raise ValueError(f"{where}: 관찰이 객체가 아니다")
    return Observation(
        listening=_text(raw, "listening", where), mark=_text(raw, "mark", where), offset_sec=_number(raw, "offsetSec", where),
        at_boundary=_flag(raw, "atBoundary", where), kind=_kind(raw.get("kind"), where), quote=_text(raw, "quote", where),
        sure=_flag(raw, "sure", where), source=_source(raw.get("source"), where),
    )


def item_from_row(row: Mapping[str, object]) -> Item:
    """item_row의 반대. text, style, audio 같은 단위 정보는 Item에 없어서 버린다."""
    where = str(row.get("id"))
    observations = row.get("observations", [])
    if not isinstance(observations, list):
        raise ValueError(f"{where}: observations가 목록이 아니다")
    kind, paired = row.get("kind"), row.get("pairedWith")
    return Item(
        id=_text(row, "id", where), label=_label(row.get("label"), where), render=_text(row, "render", where),
        unit=_whole(row, "unit", where), kind=None if kind is None else _kind(kind, where), sure=_flag(row, "sure", where),
        observations=tuple(_observation(o, where) for o in observations),
        paired_with=None if paired is None else _text(row, "pairedWith", where), tier=_tier(row.get("tier"), where),
        confirmation=_confirmation(row.get("confirmation"), where),
    )
