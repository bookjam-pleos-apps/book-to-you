from spike.render.attempt.attempt_policy import MAX_ATTEMPTS
from spike.render.batch.batch_plan import Batch
from spike.render.attempt.render_attempts import UnitOutcome
from spike.render.batch.render_rounds import pending_units, qc_rounds
from spike.story.story_plan import StorySentence

UNITS = {index: StorySentence(f"문장 {index}번이에요.", "calm", 450) for index in range(5)}


class FakeService:
    """passes_at[i]번째 시도에서 합격하는 단위. 없으면 늘 떨어진다."""

    def __init__(self, passes_at: dict[int, int]):
        self.passes_at, self.calls = passes_at, []

    def run_batch(self, batch: Batch, attempt: int) -> None:
        self.calls.append((batch.units, attempt))

    def read_outcome(self, index: int, attempt: int) -> UnitOutcome:
        passed = self.passes_at.get(index, MAX_ATTEMPTS) <= attempt
        done = passed or attempt + 1 >= MAX_ATTEMPTS
        return UnitOutcome(done, passed, attempt + 1, attempt)


def test_the_first_round_renders_every_unit_in_batches():
    service = FakeService({index: 0 for index in UNITS})

    outcomes = qc_rounds(UNITS, 2, service.run_batch, service.read_outcome)

    assert service.calls == [((0, 1), 0), ((2, 3), 0), ((4,), 0)]
    assert all(outcome.passed for outcome in outcomes.values())


def test_only_failed_units_go_to_the_next_round_with_the_next_attempt():
    service = FakeService({0: 0, 1: 1, 2: 0, 3: 2, 4: 0})

    outcomes = qc_rounds(UNITS, 8, service.run_batch, service.read_outcome)

    assert service.calls == [((0, 1, 2, 3, 4), 0), ((1, 3), 1), ((3,), 2)]
    assert [outcomes[i].attempts for i in sorted(outcomes)] == [1, 2, 1, 3, 1]


def test_rounds_stop_at_the_attempt_limit_even_if_units_keep_failing():
    service = FakeService({})

    outcomes = qc_rounds(UNITS, 8, service.run_batch, service.read_outcome)

    assert [attempt for _, attempt in service.calls] == list(range(MAX_ATTEMPTS))
    assert all(outcome.done and not outcome.passed for outcome in outcomes.values())


def test_units_already_done_are_not_pending():
    done = UnitOutcome(True, True, 1, 0)

    assert pending_units([0, 1, 2], {1: done}) == [0, 2]


def test_a_replacement_render_counts_its_attempts_from_its_own_first_attempt():
    service = FakeService({})
    first = 5

    qc_rounds({2: UNITS[2]}, 8, service.run_batch, lambda index, attempt: service.read_outcome(index, attempt - first), first_attempt=first)

    assert service.calls == [((2,), 5), ((2,), 6), ((2,), 7)]
