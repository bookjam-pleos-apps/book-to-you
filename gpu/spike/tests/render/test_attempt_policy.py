import pytest

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS, SEED_STEP, attempt_seed, attempts_done, attempts_made, prefer_later
from spike.render.attempt.render_qc import AttemptCheck

PASS = AttemptCheck(hit_budget=False, repeats_context=False, missing_chars=2, error_rate=0.15)
MILD = AttemptCheck(hit_budget=False, repeats_context=False, missing_chars=0, error_rate=0.25)
RUNAWAY = AttemptCheck(hit_budget=True, repeats_context=False, missing_chars=0, error_rate=1.0)


def test_each_attempt_moves_the_seed_by_one_step():
    assert [attempt_seed(100, attempt) for attempt in range(MAX_ATTEMPTS)] == [100, 100 + SEED_STEP, 100 + 2 * SEED_STEP]


@pytest.mark.parametrize(("attempt", "passed", "done"), [(0, False, False), (0, True, True), (MAX_ATTEMPTS - 1, False, True)])
def test_a_unit_stops_on_a_pass_or_after_the_last_attempt(attempt: int, passed: bool, done: bool):
    assert attempts_done(attempt, passed) is done


def test_a_later_pass_wins_even_over_a_failure_that_ranks_lower():
    assert MILD.failure_rank < PASS.failure_rank
    assert prefer_later(MILD, PASS)


def test_equally_bad_attempts_keep_the_later_one():
    assert prefer_later(RUNAWAY, RUNAWAY)
    assert not prefer_later(MILD, RUNAWAY)


def test_a_passed_attempt_is_never_replaced():
    assert not prefer_later(PASS, MILD)
    assert not prefer_later(PASS, PASS)


def test_the_report_counts_attempts_from_one():
    assert [attempts_made(attempt) for attempt in range(MAX_ATTEMPTS)] == [1, 2, 3]
