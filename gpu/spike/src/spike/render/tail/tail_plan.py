"""어느 단위에 어떤 꼬리를 붙일지 정한다. 순수 로직.

끊김이 child 대사와 제목에 몰려 있고 자르기가 틀릴 위험이 새로 생기므로 그 단위에만 붙인다.
방식은 데이터(data/render-tail.json)로 고른다. repeat는 말끝 끊김을 19곳 중 11곳에서 17곳 중 0곳으로 줄인 기준선이고, word는 생성 길이를 줄이려는 후보다.
"""
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Literal

from spike.clone.budget import count_syllables
from spike.render.tail.repeat_tail import repeat_tail_of
from spike.story.story_plan import SpokenTail, StorySentence

TailMode = Literal["repeat", "word", "none"]
TAIL_MODES: tuple[TailMode, ...] = ("repeat", "word", "none")
TAIL_STYLES = frozenset({"child"})
TITLE_UNIT = 0


@dataclass(frozen=True)
class TailSetting:
    mode: TailMode
    word: str


def is_tail_target(index: int, sentence: StorySentence) -> bool:
    return index == TITLE_UNIT or sentence.style in TAIL_STYLES


def word_tail_text(word: str) -> str:
    """마침표를 붙여야 앞부분과 꼬리 사이에 쉼이 생긴다."""
    return f"{word}."


def tail_word(tail: SpokenTail) -> str:
    return tail.text.removesuffix(".")


def tail_for(sentence: StorySentence, setting: TailSetting) -> SpokenTail | None:
    """반복부에 음절이 없으면(“…….” 같은 대사) 자를 위치를 추정할 수 없어 반복하지 않는다."""
    if setting.mode == "word":
        return SpokenTail(word_tail_text(setting.word), "word")
    if setting.mode == "repeat" and count_syllables(repeat_tail_of(sentence.text)) > 0:
        return SpokenTail(repeat_tail_of(sentence.text), "repeat")
    return None


def with_tails(units: Sequence[StorySentence], setting: TailSetting) -> list[StorySentence]:
    """전체 계획에 적용한다. 발췌한 뒤에 적용하면 0번 단위가 제목이 아닐 수 있다."""
    return [
        replace(unit, tail=tail_for(unit, setting)) if is_tail_target(index, unit) else unit
        for index, unit in enumerate(units)
    ]
