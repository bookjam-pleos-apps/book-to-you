from dataclasses import replace
from pathlib import Path

from spike.clone.engine.clone_port import CloneRequest
from spike.clone.scoring.eval_metrics import MAX_MISSING_CHARS
from spike.render.attempt.render_qc import MAX_CER, AttemptCheck, check_attempt, transcript_check

CLEAN = AttemptCheck(hit_budget=False, repeats_context=False, missing_chars=0, error_rate=0.0)


def test_clean_attempt_passes():
    assert CLEAN.passed


def test_each_problem_alone_fails_the_attempt():
    failures = [
        replace(CLEAN, hit_budget=True),
        replace(CLEAN, repeats_context=True),
        replace(CLEAN, missing_chars=MAX_MISSING_CHARS + 1),
        replace(CLEAN, error_rate=MAX_CER + 0.01),
    ]
    assert not any(check.passed for check in failures)


def test_audible_failures_rank_worse_than_missing_or_misheard_text():
    ordered = [
        replace(CLEAN, error_rate=0.3),
        replace(CLEAN, missing_chars=3),
        replace(CLEAN, missing_chars=9),
        replace(CLEAN, repeats_context=True),
        replace(CLEAN, hit_budget=True),
    ]
    ranks = [check.failure_rank for check in ordered]
    assert ranks == sorted(ranks)


def test_transcript_check_scores_without_context_and_keeps_the_budget_flag():
    text = "어부는 바다로 나갔어요"

    assert transcript_check(text, text).passed
    assert not transcript_check(text, text, hit_budget=True).passed
    assert not transcript_check(text, "").passed


def test_check_attempt_scores_against_the_unit_text_not_the_spoken_request():
    unit = "뭐죠?"
    request = CloneRequest(
        text=f"{unit} {unit}", reference_path=Path("ref.wav"), reference_text="참조", model="model", seed=1,
        non_streaming=True, x_vector_only=False,
    )

    assert check_attempt(request, unit, False, unit).passed
