"""감정별 재현율과 정밀도. 전체 정확도는 일부러 내지 않는다. calm이 많으면 전부 calm으로 찍어도 높게 나온다."""
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

Labeled = tuple[str, str]


@dataclass(frozen=True)
class ClassScore:
    style: str
    true_positive: int
    false_positive: int
    false_negative: int

    @property
    def recall(self) -> float | None:
        return _ratio(self.true_positive, self.true_positive + self.false_negative)

    @property
    def precision(self) -> float | None:
        """한 번도 고르지 않은 라벨의 정밀도는 0이 아니라 알 수 없음이다."""
        return _ratio(self.true_positive, self.true_positive + self.false_positive)


def _ratio(hits: int, total: int) -> float | None:
    return hits / total if total else None


def class_score(pairs: Sequence[Labeled], style: str) -> ClassScore:
    """pairs는 (정답, 예측)이다."""
    counts = Counter(((actual == style), (predicted == style)) for actual, predicted in pairs)
    return ClassScore(style, counts[(True, True)], counts[(False, True)], counts[(True, False)])


def confusion(pairs: Sequence[Labeled]) -> dict[str, dict[str, int]]:
    counts = Counter(pairs)
    actuals = sorted({actual for actual, _ in pairs})
    predictions = sorted({predicted for _, predicted in pairs})
    return {actual: {predicted: counts[(actual, predicted)] for predicted in predictions} for actual in actuals}
