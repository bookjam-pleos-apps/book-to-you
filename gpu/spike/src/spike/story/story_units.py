"""확정한 문장을 생성 단위로 묶는다. 허용 길이는 음질 측정에서 오므로 코드에 두지 않고 설정으로 받는다."""
import json
import sys
from collections.abc import Sequence
from dataclasses import dataclass, replace
from functools import reduce
from pathlib import Path

from spike.clone.budget import count_syllables
from spike.story.story_plan import PARAGRAPH_PAUSE_MS, StorySentence


# 검증 전인 녹음은 --read-as로 다른 녹음을 직접 고르게 한다. soft는 측정을 통과해 비웠다.
UNVERIFIED_STYLES: tuple[str, ...] = ()


@dataclass(frozen=True)
class UnitLimits:
    max_syllables: int
    min_syllables: int


def read_as_problems(mapping: dict[str, str], known: Sequence[str]) -> list[str]:
    """오타가 조용히 통과하면 검증 안 된 녹음으로 렌더되므로 양쪽 값을 모두 확인한다."""
    return [f"알 수 없는 style입니다: {style}" for pair in mapping.items() for style in pair if style not in known]


def read_as_conflicts(pairs: Sequence[tuple[str, str]]) -> list[str]:
    targets = {key: {value for other, value in pairs if other == key} for key, _ in pairs}
    return [f"{key}: 서로 다른 값을 줬습니다" for key, values in targets.items() if len(values) > 1]


def unverified_styles(sentences: Sequence[StorySentence], mapping: dict[str, str]) -> list[str]:
    """--read-as soft=soft처럼 그 style을 직접 고른 경우만 허용한다. 다른 style에서 넘어오는 것도 막는다."""
    rendered = {mapping.get(item.style, item.style) for item in sentences}
    return sorted(style for style in UNVERIFIED_STYLES if style in rendered and mapping.get(style) != style)


def read_styles_as(sentences: Sequence[StorySentence], mapping: dict[str, str]) -> list[StorySentence]:
    """검증되지 않은 참조를 다른 참조로 읽는다. 묶기 전에 바꿔야 생성 단위까지 같아진다."""
    return [replace(item, style=mapping.get(item.style, item.style)) for item in sentences]


def load_unit_limits(path: Path) -> UnitLimits:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return UnitLimits(raw["maxSyllables"], raw["minSyllables"])


def oversize_sentences(sentences: Sequence[StorySentence], limits: UnitLimits) -> list[str]:
    """자르면 대본과 style이 바뀌므로, 조용히 자르지 않고 원고를 고치게 한다."""
    return [
        f"{count_syllables(item.text)}음절: {item.text[:40]}"
        for item in sentences
        if count_syllables(item.text) > limits.max_syllables
    ]


def _can_join(previous: StorySentence, following: StorySentence, limits: UnitLimits) -> bool:
    if previous.style != following.style or previous.pause_after_ms >= PARAGRAPH_PAUSE_MS:
        return False
    return count_syllables(previous.text) + count_syllables(following.text) <= limits.max_syllables


def group_units(sentences: Sequence[StorySentence], limits: UnitLimits) -> list[StorySentence]:
    """style이 다른 문장은 참조가 달라 함께 생성할 수 없다. 문단 쉼은 없애지 않는다."""

    def absorb(units: list[StorySentence], item: StorySentence) -> list[StorySentence]:
        if units and _can_join(units[-1], item, limits):
            joined = StorySentence(f"{units[-1].text} {item.text}", item.style, item.pause_after_ms)
            return [*units[:-1], joined]
        return [*units, item]

    return reduce(absorb, sentences, [])


# 길이 상한을 모를 때 쓴다. 문단과 style이 바뀌는 곳만 경계가 되고, 이 경계는 상한과 관계없이 늘 생긴다.
_NO_LENGTH_LIMIT = UnitLimits(max_syllables=sys.maxsize, min_syllables=0)


def units_at_fixed_boundaries(sentences: Sequence[StorySentence]) -> list[StorySentence]:
    return group_units(sentences, _NO_LENGTH_LIMIT)


def short_units(units: Sequence[StorySentence], limits: UnitLimits) -> list[str]:
    """경계의 짧은 대사는 합칠 수 없어 남을 수 있다. 음색이 흔들릴 수 있어 경고만 한다."""
    return [
        f"{count_syllables(unit.text)}음절: {unit.text[:40]}"
        for unit in units
        if count_syllables(unit.text) < limits.min_syllables
    ]
