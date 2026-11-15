"""라벨링 방법을 test-sentences의 문항 단위로 비교한다. 정답이 문항 단위라 분할하지 않고 문항 전체를 넣는다."""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from spike.clone.catalog import EvalSentence
from spike.story.story_plan import rule_style
from spike.story.story_split import curly_quotes
from spike.story.style_metrics import class_score, confusion
from spike.story.style_tag_plan import ContextWindow, StyleSchema, tagging_text, top_style

JUDGED_STYLES = ("excited", "soft")

Scorer = Callable[[str], Mapping[str, float]]
Decide = Callable[[Mapping[str, float]], str]


@dataclass(frozen=True)
class NimbleCondition:
    id: str
    normalize_quotes: bool
    context: bool


# 주 조건은 제품 경로와 같은 첫 항목이고, 측정 전에 고정했다.
NIMBLE_CONDITIONS = (
    NimbleCondition("nimble_curly_context", True, True),
    NimbleCondition("nimble_curly_alone", True, False),
    NimbleCondition("nimble_raw_context", False, True),
    NimbleCondition("nimble_raw_alone", False, False),
)
NO_CONTEXT = ContextWindow(0, 0, 0)


def _summary(sentences: Sequence[EvalSentence], predicted: Sequence[str]) -> dict:
    pairs = [(sentence.style, style) for sentence, style in zip(sentences, predicted)]
    scores = [class_score(pairs, style) for style in JUDGED_STYLES]
    return {
        "scores": {
            score.style: {
                "tp": score.true_positive,
                "fp": score.false_positive,
                "fn": score.false_negative,
                "recall": score.recall,
                "precision": score.precision,
            }
            for score in scores
        },
        "confusion": confusion(pairs),
        "misses": [
            {"id": sentence.id, "actual": sentence.style, "predicted": style}
            for sentence, style in zip(sentences, predicted)
            if sentence.style != style
        ],
    }


def baselines(sentences: Sequence[EvalSentence]) -> dict[str, dict]:
    methods: dict[str, Callable[[str], str]] = {
        "all_calm": lambda _: "calm",
        "rule_raw": rule_style,
        "rule_curly": lambda text: rule_style(curly_quotes(text)),
    }
    return {name: _summary(sentences, [method(item.text) for item in sentences]) for name, method in methods.items()}


def _condition_texts(sentences: Sequence[EvalSentence], condition: NimbleCondition, schema: StyleSchema) -> list[str]:
    texts = [curly_quotes(item.text) if condition.normalize_quotes else item.text for item in sentences]
    window = schema.context if condition.context else NO_CONTEXT
    return [tagging_text(texts, index, window) for index in range(len(texts))]


def nimble_condition(
    sentences: Sequence[EvalSentence], condition: NimbleCondition, schema: StyleSchema, score: Scorer, decide: Decide
) -> dict:
    """임계값은 calm 쪽으로 밀어 실제 재현율을 가리므로, 적용 전과 후를 함께 남긴다."""
    probabilities = [score(text) for text in _condition_texts(sentences, condition, schema)]
    return {
        "raw": _summary(sentences, [top_style(item) for item in probabilities]),
        "decided": _summary(sentences, [decide(item) for item in probabilities]),
        "probabilities": {item.id: dict(probs) for item, probs in zip(sentences, probabilities)},
    }
