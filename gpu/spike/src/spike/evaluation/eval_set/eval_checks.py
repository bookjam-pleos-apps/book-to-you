"""확인 청취(이름을 가리고 섞은 클립)의 답을 시험 세트에 반영한다. 외부 라이브러리 없는 순수 로직이다.

클립 청취는 렌더 전체를 들은 것이 아니라서 지표 일치 계산의 '청취' 층에 넣지 않는다(관찰 출처 clip_check).
대신 항목의 확실 여부와 확인 결과(confirmation)를 바꾼다. 정상으로 고른 단위가 지목되면 지목 항목이 된다.
재현 규칙: 경계 클립은 단위 시작 -1~+3초 안의 지목, 한가운데 클립(단위 시작이 클립 앞)은 클립 안 아무 지목, 또는 "내 목소리 아님".
"""
from collections.abc import Sequence
from dataclasses import dataclass, replace

from spike.evaluation.eval_set.eval_items import FlagRow, Item, Mark
from spike.evaluation.eval_set.eval_set import BOUNDARY_AFTER_SEC, BOUNDARY_BEFORE_SEC, Flag
from spike.evaluation.eval_set.eval_vocab import TONE_JUMP, Kind

MY_VOICE_ANSWERS = ("예", "아니오", "애매")
CHANGE_ANSWERS = ("예", "아니오")
NOT_MY_VOICE = "아니오"
NOT_MY_VOICE_KIND: Kind = "not_my_voice"


@dataclass(frozen=True)
class ClipAnswer:
    clip: int
    render: str
    unit: int
    unit_start_sec: float
    mark_sec: float | None
    my_voice: str
    reverb_change: str


@dataclass(frozen=True)
class ClipCheck:
    id: str
    file: str
    answers: tuple[ClipAnswer, ...]


def reproduced(answer: ClipAnswer) -> bool:
    if answer.my_voice == NOT_MY_VOICE:
        return True
    if answer.mark_sec is None:
        return False
    if answer.unit_start_sec < 0:
        return True
    return -BOUNDARY_BEFORE_SEC <= answer.mark_sec - answer.unit_start_sec <= BOUNDARY_AFTER_SEC


def _mark(answer: ClipAnswer, kind: Kind) -> Mark:
    at = "x" if answer.mark_sec is None else f"{answer.mark_sec:g}s"
    quote = f"확인 청취 클립 {answer.clip}: 바뀌는 순간 {at}, 내 목소리 {answer.my_voice}, 울림 바뀜 {answer.reverb_change}"
    return Mark(at=f"clip{answer.clip:02d}@{at}", kind=kind, quote=quote)


def check_flags(check: ClipCheck) -> list[FlagRow]:
    """재현된 클립만 지목으로 바꾼다. 종류는 "내 목소리 아님"이면 not_my_voice, 아니면 tone_jump."""
    def row(answer: ClipAnswer) -> FlagRow:
        kind = NOT_MY_VOICE_KIND if answer.my_voice == NOT_MY_VOICE else TONE_JUMP
        flag = Flag(listening=check.id, render=answer.render, unit=answer.unit, kind=kind, at_boundary=answer.unit_start_sec >= 0, strong=False)
        offset = 0.0 if answer.mark_sec is None else answer.mark_sec - answer.unit_start_sec
        return flag, _mark(answer, kind), offset
    return [row(a) for a in check.answers if reproduced(a)]


def apply_checks(items: Sequence[Item], checks: Sequence[ClipCheck]) -> list[Item]:
    """재현된 지목은 확실로 올리고, 재현 안 된 지목은 표시만 한다. 확인된 정상은 확실로 올린다."""
    results = {(a.render, a.unit): reproduced(a) for check in checks for a in check.answers}

    def updated(item: Item) -> Item:
        result = results.get((item.render, item.unit))
        if result is None:
            return item
        if item.label == "flagged":
            return replace(item, sure=item.sure or result, confirmation="reproduced" if result else "not_reproduced")
        return item if result else replace(item, sure=True, confirmation="confirmed_normal")
    return [updated(i) for i in items]
