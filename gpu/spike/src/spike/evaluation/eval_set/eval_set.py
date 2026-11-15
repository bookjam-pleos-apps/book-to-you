"""청취 지목을 생성 단위에 대응시킨다. 외부 라이브러리 없는 순수 로직이다.

지목이 단위 시작 -1~+3초 안이면 그 단위 경계의 지목이다(청취 절차 N6). 아니면 지목 시각을 품은 단위의 한가운데 지목이다.
판정은 같은 청취 안의 상대 비교로만 믿는다. 그래서 정상 항목은 같은 렌더에서 지목되지 않은 단위로 고른다.
"""
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import accumulate

from spike.evaluation.eval_set.eval_vocab import EXCLUDED_KINDS, Kind

BOUNDARY_BEFORE_SEC, BOUNDARY_AFTER_SEC = 1.0, 3.0
# 청취자가 적은 시각은 초 단위이고 ±1~2초 오차가 있다.
MARK_TOLERANCE_SEC = 2.0
# 0번 단위는 이야기 제목이라 지목·정상 비교에서 뺀다.
TITLE_UNIT = 0
OPENING_QUOTES = ("“", "‘", '"')


@dataclass(frozen=True)
class Unit:
    text: str
    style: str
    duration_sec: float
    pause_after_ms: int


@dataclass(frozen=True)
class Located:
    unit: int
    offset_sec: float
    at_boundary: bool


@dataclass(frozen=True)
class Flag:
    listening: str
    render: str
    unit: int
    kind: Kind
    at_boundary: bool
    strong: bool


def _step_seconds(unit: Unit) -> float:
    return unit.duration_sec + unit.pause_after_ms / 1000


def unit_start_seconds(units: Sequence[Unit]) -> tuple[float, ...]:
    """story.wav는 단위 뒤에 쉼을 넣어 이은 것이라 단위 시작은 앞 단위 길이와 쉼의 누적이다.

    길이는 반올림한 report 값이 아니라 단위 wav의 실제 길이를 넘겨야 한다(story_render.unit_starts와 같은 이유).
    """
    return tuple(accumulate((_step_seconds(u) for u in units[:-1]), initial=0.0))


def story_end_seconds(units: Sequence[Unit]) -> float:
    return sum(_step_seconds(u) for u in units)


def locate(mark_sec: float, starts: Sequence[float], story_end: float) -> Located:
    """앞 단위의 +3초 창과 다음 단위의 -1초 창이 겹치면 이미 들은 단위(품은 단위)를 고른다.

    묶음 판정의 story_verdict.marked_boundary(시작 뒤 4초, 나중 묶음 우선)와 창과 우선순위가 다르다.
    """
    if not starts:
        raise ValueError("단위가 없는 렌더에는 지목을 대응시킬 수 없다")
    if not 0.0 <= mark_sec <= story_end + MARK_TOLERANCE_SEC:
        raise ValueError(f"지목 {mark_sec:.0f}초가 이야기 길이 {story_end:.0f}초를 벗어난다")
    containing = max(i for i, s in enumerate(starts) if s <= mark_sec)
    offset = mark_sec - starts[containing]
    if offset <= BOUNDARY_AFTER_SEC:
        return Located(unit=containing, offset_sec=offset, at_boundary=True)
    upcoming = containing + 1
    if upcoming < len(starts) and starts[upcoming] - mark_sec <= BOUNDARY_BEFORE_SEC:
        return Located(unit=upcoming, offset_sec=mark_sec - starts[upcoming], at_boundary=True)
    return Located(unit=containing, offset_sec=offset, at_boundary=False)


def _counts_as_evidence(flag: Flag) -> bool:
    return flag.at_boundary and flag.kind not in EXCLUDED_KINDS


def is_sure(flag: Flag, flags: Sequence[Flag]) -> bool:
    """같은 렌더의 같은 단위를 다른 청취에서도 경계 지목했거나, 사용자가 한 곳을 강하게 짚은 경계 지목만 확실로 둔다."""
    if not _counts_as_evidence(flag):
        return False
    same_unit = [f for f in flags if f.render == flag.render and f.unit == flag.unit and _counts_as_evidence(f)]
    return flag.strong or bool({f.listening for f in same_unit} - {flag.listening})


def text_starts_with_quote(text: str) -> bool:
    return text.lstrip().startswith(OPENING_QUOTES)
