import json
from dataclasses import dataclass
from itertools import product
from pathlib import Path

import pytest
from job_fixture import example_job

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS, SEED_STEP
from spike.clone.budget import token_budget
from spike.render.attempt.render_attempts import (
    AttemptRecord,
    Measurement,
    attempt_record,
    attempt_spec,
    TakeFacts,
    UnitOutcome,
    chosen_record,
    needs_split_transcription,
    outcome_from,
    qc_texts,
    record_from_dict,
    record_to_dict,
    unit_outcome,
)
from spike.render.job.render_job import RenderJob, job_units, load_render_job
from spike.story.story_plan import StorySentence

# (missing_chars, error_rate, hit_budget). 합격은 CER 0.2 이하·빠진 구간 2 이하·예산 안.
POOL = {
    "pass": (0, 0.0, False),
    "pass_loose": (2, 0.15, False),
    "mild": (0, 0.25, False),
    "mild_again": (0, 0.25, False),
    "missing": (5, 0.1, False),
    "runaway": (0, 1.0, True),
}


@dataclass(frozen=True)
class JobContext:
    dir: Path
    job: RenderJob
    units: list[StorySentence]


@pytest.fixture
def job(tmp_path: Path) -> JobContext:
    job_dir = example_job(tmp_path)
    loaded = load_render_job(job_dir)
    return JobContext(job_dir, loaded, job_units(loaded))


def record(attempt: int, name: str) -> AttemptRecord:
    missing, error_rate, hit_budget = POOL[name]
    return AttemptRecord(attempt, "원문", 1234 + attempt * SEED_STEP, name, 1.0, hit_budget, missing, error_rate)


def _python_render_choice(records: list[AttemptRecord], index: int = 0) -> int:
    """story_render._best_attempt와 같은 뒤에서부터 고르기. 앞으로 접는 chosen_record와 같아야 한다."""
    current = records[index]
    if current.check.passed or index + 1 >= len(records):
        return index
    later = _python_render_choice(records, index + 1)
    if records[later].check.passed or records[later].check.failure_rank <= current.check.failure_rank:
        return later
    return index


def _attempt_sequences() -> list[list[str]]:
    """실제로 생기는 시도 순서만 만든다. 합격하면 거기서 멈추고, 아니면 MAX_ATTEMPTS까지 간다."""
    names = list(POOL)
    every = [list(seq) for length in range(1, MAX_ATTEMPTS + 1) for seq in product(names, repeat=length)]
    return [seq for seq in every if _is_reachable(seq)]


def _is_reachable(seq: list[str]) -> bool:
    passed = [record(0, name).check.passed for name in seq]
    return not any(passed[:-1]) and (passed[-1] or len(seq) == MAX_ATTEMPTS)


@pytest.mark.parametrize("names", _attempt_sequences(), ids="-".join)
def test_folding_forward_picks_the_same_attempt_as_the_python_render(names: list[str]):
    records = [record(attempt, name) for attempt, name in enumerate(names)]

    assert chosen_record(records).attempt == _python_render_choice(records)


def test_a_unit_is_done_on_a_pass_or_after_the_last_attempt():
    assert unit_outcome([record(0, "pass")]).done
    assert not unit_outcome([record(0, "mild")]).done
    assert unit_outcome([record(attempt, "mild") for attempt in range(MAX_ATTEMPTS)]).done


def test_the_outcome_counts_attempts_made_and_keeps_the_chosen_one():
    outcome = unit_outcome([record(0, "mild"), record(1, "runaway"), record(2, "missing")])

    assert (outcome.attempts, outcome.chosen_attempt, outcome.passed) == (3, 0, False)


def test_spec_matches_the_python_render_request(job: JobContext):
    unit = job.units[1]

    spec = attempt_spec(job.dir, job.job, job.units, 1, 2)

    assert (spec.text, spec.seed, spec.max_new_tokens) == (unit.text, job.job.seed + 2 * SEED_STEP, token_budget(unit.text))
    assert spec.reference_path == str((job.dir / f"reference-{unit.style}.wav").resolve())
    assert spec.audio_path == str(job.dir / "attempts" / "0001-a2.wav")
    assert spec.unit_text == unit.text


def test_a_runaway_attempt_is_judged_without_transcription(job: JobContext):
    spec = attempt_spec(job.dir, job.job, job.units, 0, 0)

    result = attempt_record(spec, Measurement(30.0, hit_budget=True, is_long=True), ["무시되는 받아쓰기"])

    assert (result.transcript, result.check.passed, result.error_rate) == ("", False, 1.0)


def test_segment_transcripts_are_trimmed_and_joined_like_the_compose_client(job: JobContext):
    spec = attempt_spec(job.dir, job.job, job.units, 0, 0)

    result = attempt_record(spec, Measurement(31.0, hit_budget=False, is_long=True), [f" {spec.text[:3]} ", "", spec.text[3:]])

    assert result.transcript == f"{spec.text[:3]} {spec.text[3:]}"


def test_records_survive_the_json_round_trip():
    original = record(1, "mild")

    assert record_from_dict(json.loads(json.dumps(record_to_dict(original)))) == original


@pytest.mark.usefixtures("repeat_tail")
def test_the_title_spec_sends_both_takes_but_checks_the_title(job: JobContext):
    spec = attempt_spec(job.dir, job.job, job.units, 0, 0)
    title = job.units[0].text

    assert (spec.text, spec.unit_text) == (f"{title}. {title}.", title)
    assert spec.max_new_tokens == token_budget(spec.text)


def test_a_replacement_outcome_counts_from_its_first_attempt():
    failed = AttemptRecord(5, "문장", 6234, "", 1.0, False, 3, 1.0)
    passed = AttemptRecord(6, "문장", 7234, "문장", 1.0, False, 0, 0.0)

    assert outcome_from([failed], 5) == UnitOutcome(False, False, 1, 5)
    assert outcome_from([failed, passed], 5) == UnitOutcome(True, True, 2, 6)


@pytest.mark.parametrize(("take", "texts"), [
    (TakeFacts(False, True), []),
    (TakeFacts(False, False, head_transcript="네 엄마 걱정하지 마세요"), ["네 엄마 걱정하지 마세요"]),
    (TakeFacts(False, False), ["받아쓴", "구간"]),
])
def test_qc_compares_the_head_transcript_when_the_tail_cut_already_heard_it(take, texts):
    assert qc_texts(take, ["받아쓴", "구간"]) == texts


@pytest.mark.parametrize(("take", "is_long", "split"), [
    (TakeFacts(False, False), True, True),
    (TakeFacts(False, False), False, False),
    (TakeFacts(True, False), True, False),
    (TakeFacts(False, True), True, False),
    (TakeFacts(False, False, head_transcript="이미 받아씀"), True, False),
])
def test_only_long_takes_that_still_need_transcribing_are_split_by_vad(take, is_long, split):
    assert needs_split_transcription(take, is_long) is split
