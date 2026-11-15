"""청취 기록과 렌더 단위 표로 시험 세트 항목(지목 구간 + 짝 정상 구간)을 만든다. 외부 라이브러리 없는 순수 로직이다.

항목 하나는 렌더의 단위 하나이고, id는 "렌더#단위"라 입력 순서가 바뀌어도 그대로다.
같은 단위가 여러 청취에서 지목되면 관찰(observation)을 모아 한 항목으로 둔다.
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace

from spike.evaluation.eval_set.eval_normals import match_normals
from spike.evaluation.eval_set.eval_set import TITLE_UNIT, Flag, Unit, is_sure, locate, story_end_seconds, unit_start_seconds
from spike.evaluation.eval_set.eval_vocab import CLIP_CHECK, EXCLUDED_KINDS, LISTENING, TONE_JUMP, Confirmation, Kind, Label, Source, Tier
from spike.listening.mark_time import mark_seconds

REPEATED_IN_RENDERS = 2


@dataclass(frozen=True)
class Mark:
    at: str
    kind: Kind
    quote: str
    strong: bool = False


@dataclass(frozen=True)
class Listening:
    id: str
    render: str
    file: str
    marks: tuple[Mark, ...]


@dataclass(frozen=True)
class Render:
    units: tuple[Unit, ...]
    audio: tuple[str, ...]


@dataclass(frozen=True)
class Observation:
    listening: str
    mark: str
    offset_sec: float
    at_boundary: bool
    kind: Kind
    quote: str
    sure: bool
    source: Source = LISTENING


@dataclass(frozen=True)
class Item:
    id: str
    label: Label
    render: str
    unit: int
    kind: Kind | None
    sure: bool
    observations: tuple[Observation, ...] = ()
    paired_with: str | None = None
    tier: Tier = "reserve"
    confirmation: Confirmation | None = None


FlagRow = tuple[Flag, Mark, float]


def item_id(render: str, unit: int) -> str:
    return f"{render}#{unit}"


def _flags(listening: Listening, render: Render) -> list[FlagRow]:
    starts, end = unit_start_seconds(render.units), story_end_seconds(render.units)
    located = [(m, locate(mark_seconds(m.at), starts, end)) for m in listening.marks]
    return [
        (Flag(listening=listening.id, render=listening.render, unit=at.unit, kind=m.kind, at_boundary=at.at_boundary, strong=m.strong), m, at.offset_sec)
        for m, at in located
        if at.unit != TITLE_UNIT
    ]


def _observation(flag: Flag, mark: Mark, offset: float, flags: Sequence[Flag], clip_checks: frozenset[str]) -> Observation:
    return Observation(listening=flag.listening, mark=mark.at, offset_sec=round(offset, 1), at_boundary=flag.at_boundary,
                       kind=flag.kind, quote=mark.quote, sure=is_sure(flag, flags),
                       source=CLIP_CHECK if flag.listening in clip_checks else LISTENING)


def representative_kind(observations: Sequence[Observation]) -> Kind:
    """종류가 섞이면 조립 실수가 아닌 첫 지목을 고른다. 조립 실수가 먼저 적혔다고 모델 실패 지목이 빠지지 않게 한다."""
    return next((o.kind for o in observations if o.kind not in EXCLUDED_KINDS), observations[0].kind)


def flagged_items(listenings: Sequence[Listening], renders: Mapping[str, Render],
                  extra: Sequence[FlagRow] = (), clip_checks: frozenset[str] = frozenset()) -> list[Item]:
    """제목(0번) 단위에 찍힌 지목은 짝 정상 고르기와 같이 뺀다. extra는 확인 청취(clip_checks의 id)에서 온 지목이다."""
    rows = [row for li in listenings for row in _flags(li, renders[li.render])] + list(extra)
    flags = [f for f, _, _ in rows]
    keys = list(dict.fromkeys((f.render, f.unit) for f in flags))
    grouped = [tuple(_observation(f, m, o, flags, clip_checks) for f, m, o in rows if (f.render, f.unit) == key) for key in keys]
    return [
        Item(id=item_id(render, unit), label="flagged", render=render, unit=unit, kind=representative_kind(obs), sure=any(o.sure for o in obs), observations=obs)
        for (render, unit), obs in zip(keys, grouped)
    ]


def _paired_normals(targets: Sequence[Item], render: Render, taken: frozenset[int]) -> list[tuple[Item, int]]:
    normals = match_normals([t.unit for t in targets], render.units, taken)
    return [(target, normal) for target, normal in zip(targets, normals) if normal is not None]


def normal_items(flagged: Sequence[Item], renders: Mapping[str, Render], listened: Mapping[str, int]) -> list[Item]:
    """지목 항목마다 같은 렌더의 짝 정상 단위. 렌더를 두 번 이상 들었는데 한 번도 지목 안 됐으면 확실로 둔다."""
    targets = [i for i in flagged if i.kind not in EXCLUDED_KINDS]
    taken = lambda r: frozenset(i.unit for i in flagged if i.render == r)
    pairs = [pair for r in dict.fromkeys(t.render for t in targets) for pair in _paired_normals([t for t in targets if t.render == r], renders[r], taken(r))]
    return [
        Item(id=item_id(t.render, normal), label="normal", render=t.render, unit=normal, kind=None,
             sure=listened[t.render] >= REPEATED_IN_RENDERS, paired_with=t.id, tier=t.tier)
        for t, normal in pairs
    ]


def first_per_text(items: Sequence[Item], text_of: Mapping[str, str]) -> list[Item]:
    """문장마다 맨 앞 항목 하나만 남긴다."""
    seen = list(dict.fromkeys(text_of[i.id] for i in items))
    return [next(i for i in items if text_of[i.id] == text) for text in seen]


def with_core_tier(flagged: Sequence[Item], text_of: Mapping[tuple[str, int], str]) -> list[Item]:
    """core는 확실한 지목, 톤 말고 목소리·끌림 지목, 그리고 둘 이상의 렌더에서 지목된 문장의 첫 경계 지목이다."""
    usable = [i for i in flagged if i.kind not in EXCLUDED_KINDS]
    text = {i.id: "".join(text_of[(i.render, i.unit)].split()) for i in usable}
    base = [i for i in usable if i.sure or i.kind != TONE_JUMP]
    renders_per_text = {t: {i.render for i in usable if text[i.id] == t} for t in text.values()}
    covered = {text[i.id] for i in base}
    repeated = [i for i in usable if len(renders_per_text[text[i.id]]) >= REPEATED_IN_RENDERS and text[i.id] not in covered and i.observations[0].at_boundary]
    core = {i.id for i in base} | {i.id for i in first_per_text(repeated, text)}
    return [replace(i, tier="core") if i.id in core else i for i in flagged]
