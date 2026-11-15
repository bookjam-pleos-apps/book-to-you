"""남은 단위를 한 번에 생성할 배치로 나눈다. 순수 로직.

포크의 clone 배치는 참조 녹음을 하나만 받으므로 배치는 style 하나로만 묶는다.
배치는 가장 긴 단위가 끝나야 끝나므로, 생성 예산(보낸 글의 음절)이 비슷한 단위끼리 묶는다.
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from spike.clone.budget import token_budget
from spike.render.tail.repeat_tail import spoken_text
from spike.story.story_plan import StorySentence


@dataclass(frozen=True)
class Batch:
    style: str
    units: tuple[int, ...]


def _styles_in_order(units: Mapping[int, StorySentence], pending: Sequence[int]) -> list[str]:
    return list(dict.fromkeys(units[index].style for index in sorted(pending)))


def _chunks(indices: Sequence[int], size: int) -> list[tuple[int, ...]]:
    return [tuple(indices[start:start + size]) for start in range(0, len(indices), size)]


def plan_batches(units: Mapping[int, StorySentence], pending: Sequence[int], batch_size: int) -> list[Batch]:
    """style은 이야기에 처음 나오는 순서, 배치 안은 예산 순(같으면 단위 번호 순)이다. 같은 입력이면 늘 같은 배치다."""
    if batch_size < 1:
        raise ValueError(f"배치 크기는 1 이상입니다: {batch_size}")
    return [
        Batch(style, chunk)
        for style in _styles_in_order(units, pending)
        for chunk in _chunks(sorted((i for i in pending if units[i].style == style), key=lambda i: (token_budget(spoken_text(units[i])), i)), batch_size)
    ]
