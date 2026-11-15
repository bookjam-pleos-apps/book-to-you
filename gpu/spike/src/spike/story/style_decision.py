"""Nimble의 확률을 초안 라벨로 바꾼다. 확률은 보정되지 않았으므로 임계값은 측정 전 잠정값이다."""
from collections.abc import Mapping

from spike.story.style_tag_plan import top_style

DEFAULT_STYLE = "calm"


def draft_style(probabilities: Mapping[str, float], min_confidence: float) -> str:
    top = top_style(probabilities)
    return top if probabilities[top] >= min_confidence else DEFAULT_STYLE
