"""배치 하나를 compose clone 배치 액션에 넘길 값. 단위별 시도 사양(attempt_spec)을 모은다. 순수 로직."""
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import TypeVar

from spike.render.attempt.render_attempts import AttemptSpec


@dataclass(frozen=True)
class BatchUnit:
    """for-each가 생성음과 짝지어 render-save·render-take에 넘기는 단위 하나."""
    job_dir: str
    unit_index: int
    attempt: int


@dataclass(frozen=True)
class BatchSpec:
    texts: tuple[str, ...]
    reference_path: str
    reference_text: str
    seed: int
    max_new_tokens: int
    batch_size: int
    units: tuple[BatchUnit, ...]


T = TypeVar("T")


def _only(values: Iterable[T], name: str) -> T:
    distinct = set(values)
    if len(distinct) != 1:
        raise ValueError(f"한 배치는 {name}이 하나여야 합니다: {sorted(map(str, distinct))}")
    return next(iter(distinct))


def batch_spec(job_dir: str, specs: Sequence[AttemptSpec]) -> BatchSpec:
    """배치 전체가 같은 참조와 seed로 한 번에 생성된다. 생성 상한은 가장 긴 단위에 맞추고, 단위별 폭주는 save가 단위 글 기준으로 잰다."""
    if not specs:
        raise ValueError("빈 배치는 낼 수 없습니다")
    return BatchSpec(
        tuple(spec.text for spec in specs),
        _only((spec.reference_path for spec in specs), "참조"),
        _only((spec.reference_text for spec in specs), "참조 대본"),
        _only((spec.seed for spec in specs), "seed"),
        max(spec.max_new_tokens for spec in specs),
        len(specs),
        tuple(BatchUnit(job_dir, spec.unit_index, spec.attempt) for spec in specs),
    )
