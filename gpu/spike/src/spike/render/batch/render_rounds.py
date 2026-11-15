"""단위를 라운드로 렌더한다. 라운드마다 남은 단위를 배치로 만들고, 받아쓰기 QC에서 떨어진 단위만 다음 seed로 다시 만든다.

생성과 판정 기록은 주입받는다(compose 워크플로우 render-batch가 시도 파일을 쓰고, read_outcome이 읽는다).
재시도 규칙(최대 시도 수, 시도마다 seed)은 단위별 렌더(attempt_policy)와 같다.
"""
from collections.abc import Callable, Mapping, Sequence
from functools import reduce

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS
from spike.render.batch.batch_plan import Batch, plan_batches
from spike.render.attempt.render_attempts import UnitOutcome
from spike.story.story_plan import StorySentence

RunBatch = Callable[[Batch, int], None]
ReadOutcome = Callable[[int, int], UnitOutcome]
Outcomes = Mapping[int, UnitOutcome]


def pending_units(indices: Sequence[int], outcomes: Outcomes) -> list[int]:
    return [index for index in indices if index not in outcomes or not outcomes[index].done]


def run_batches(batches: Sequence[Batch], attempt: int, run_batch: RunBatch) -> int:
    """배치를 차례로 낸다. 결과는 시도 파일에 남으므로 낸 배치 수만 센다."""
    return reduce(lambda count, batch: run_batch(batch, attempt) or count + 1, batches, 0)


def qc_rounds(
    units: Mapping[int, StorySentence],
    batch_size: int,
    run_batch: RunBatch,
    read_outcome: ReadOutcome,
    first_attempt: int = 0,
    attempt: int | None = None,
    outcomes: Outcomes | None = None,
) -> dict[int, UnitOutcome]:
    """first_attempt번 시도부터 MAX_ATTEMPTS번까지. 목소리 대체 렌더는 앞 시도와 번호가 겹치지 않게 first_attempt를 옮긴다."""
    current = first_attempt if attempt is None else attempt
    done = dict(outcomes or {})
    pending = pending_units(sorted(units), done)
    if not pending or current >= first_attempt + MAX_ATTEMPTS:
        return done
    run_batches(plan_batches(units, pending, batch_size), current, run_batch)
    updated = {**done, **{index: read_outcome(index, current) for index in pending}}
    return qc_rounds(units, batch_size, run_batch, read_outcome, first_attempt, current + 1, updated)
