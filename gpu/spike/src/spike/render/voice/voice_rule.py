"""인물 녹음(child 등) 단위의 목소리가 어긋났는지 판정한다. 다시 굴릴지, 그대로 둘지, 다른 녹음으로 대체할지. 순수 로직.

근거: 같은 녹음 단위끼리의 평균 목소리 대비 유사도가 child 지목과 맞았다(적중 3/4,
AUC 0.875). 렌더 전체 평균 대비는 서술이 평균을 끌어 인물 녹음 자체를 잡는다. 같은 style 단위가 적으면 평균이 불안정해 참조 녹음 대비로 본다.
"잡음" 지목(fisherman 10)은 유사도로 잡히지 않았다. 이 규칙으로는 고칠 수 없는 유형이다.
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from math import ceil
from typing import Literal

Step = Literal["keep", "reroll", "fallback"]


@dataclass(frozen=True)
class VoiceRule:
    styles: frozenset[str]
    bottom_share: float
    min_group: int
    max_rerolls: int
    fallback_style: str
    group_floor: float
    reference_floor: float


@dataclass(frozen=True)
class VoiceScore:
    """group은 첫 판 같은 style 단위들의 평균 목소리 대비, reference는 그 style 참조 녹음 대비 코사인 유사도다."""
    group: float
    reference: float


@dataclass(frozen=True)
class GroupNorm:
    """한 style 무리의 판정 기준. cut은 첫 판에서 짚지 않은 단위 중 가장 낮은 group 값이다(작은 무리면 None)."""
    size: int
    cut: float | None


def style_groups(styles: Mapping[int, str], rule: VoiceRule) -> dict[str, list[int]]:
    return {style: sorted(i for i, s in styles.items() if s == style) for style in sorted(rule.styles) if style in styles.values()}


def uses_group(size: int, rule: VoiceRule) -> bool:
    return size >= rule.min_group


def _lowest(scores: Mapping[int, VoiceScore], members: Sequence[int], count: int) -> list[int]:
    """group 값이 낮은 count개. 같으면 앞 번호가 먼저다."""
    return sorted(sorted(members, key=lambda i: (scores[i].group, i))[:count])


def flagged_in_group(scores: Mapping[int, VoiceScore], members: Sequence[int], rule: VoiceRule) -> list[int]:
    """큰 무리는 하위 bottom_share(올림, 최소 1개)를 짚는다. 작은 무리는 참조 녹음 대비 바닥 아래만 짚는다."""
    if uses_group(len(members), rule):
        return _lowest(scores, members, ceil(len(members) * rule.bottom_share))
    return [i for i in members if scores[i].reference < rule.reference_floor]


def group_norm(scores: Mapping[int, VoiceScore], members: Sequence[int], flagged: Sequence[int], rule: VoiceRule) -> GroupNorm:
    normal = [scores[i].group for i in members if i not in flagged]
    cut = min(normal) if uses_group(len(members), rule) and normal else None
    return GroupNorm(len(members), cut)


def is_normal(score: VoiceScore, norm: GroupNorm, rule: VoiceRule) -> bool:
    if norm.cut is None:
        return score.reference >= rule.reference_floor
    return score.group >= norm.cut


def below_floor(score: VoiceScore, norm: GroupNorm, rule: VoiceRule) -> bool:
    if norm.cut is None:
        return score.reference < rule.reference_floor
    return score.group < rule.group_floor


def best_score(scores: Sequence[VoiceScore], norm: GroupNorm) -> VoiceScore:
    """QC를 통과한 시도들 중 판정에 쓰는 값이 가장 높은 것. 같으면 앞 시도다."""
    key = (lambda score: score.reference) if norm.cut is None else (lambda score: score.group)
    return max(scores, key=key)


def next_step(best: VoiceScore, rerolls: int, norm: GroupNorm, rule: VoiceRule) -> Step:
    """정상 범위면 그대로 둔다. 아니면 상한까지 다시 굴리고, 그래도 바닥 아래면 대체한다. 바닥 위면 가장 나은 시도를 쓴다."""
    if is_normal(best, norm, rule):
        return "keep"
    if rerolls < rule.max_rerolls:
        return "reroll"
    return "fallback" if below_floor(best, norm, rule) else "keep"
