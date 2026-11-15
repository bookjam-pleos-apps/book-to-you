"""배치 안 단위들의 받아쓰기 입력을 하나의 목록으로 펴고, 받아쓰기 결과를 단위별로 되돌린다. 순수 로직.

whisper를 배치 하나에 한 번만 부르려고 단위마다 여러 개인 조각(꼬리 조각, 30초 구간)을 한 줄로 이어 보낸다.
"""
from collections.abc import Sequence
from itertools import accumulate
from typing import TypeVar

T = TypeVar("T")


def flattened(groups: Sequence[Sequence[T]]) -> list[T]:
    return [item for group in groups for item in group]


def split_back(flat: Sequence[T], counts: Sequence[int]) -> list[list[T]]:
    """counts는 단위마다 보낸 조각 수다. 받은 수가 다르면 단위와 받아쓰기가 어긋난 것이라 멈춘다."""
    if len(flat) != sum(counts):
        raise ValueError(f"받아쓰기 {len(flat)}개가 보낸 조각 {sum(counts)}개와 다릅니다")
    ends = list(accumulate(counts))
    return [list(flat[end - count:end]) for count, end in zip(counts, ends)]
