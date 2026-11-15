import pytest

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS, SEED_STEP
from spike.clone.budget import count_syllables
from spike.experiments.render.run_unit_ladder import parse_ladder_args
from spike.render.trials.unit_ladder import (
    LENGTH_TOLERANCE,
    SEEDS,
    TARGET_SYLLABLES,
    UNITS_PER_TARGET,
    job_key,
    ladder_jobs,
    ladder_rows,
    ladder_units,
    lost_tail,
    pending_jobs,
)

TEN = "가나다라마바사아자차."
STORY = ["가나다라마."] * 400


def test_every_unit_is_within_tolerance_of_its_target():
    units = ladder_units(STORY, 60)
    assert all(abs(count_syllables(unit) - 60) <= 60 * LENGTH_TOLERANCE for unit in units)


def test_units_of_one_target_do_not_share_sentences():
    story = [f"{'가' * 9}{index}." for index in range(40)]
    units = ladder_units(story, 60)
    words = [sentence for unit in units for sentence in unit.split(" ")]
    assert len(words) == len(set(words))


def test_units_are_spread_across_the_story():
    story = [f"{'가' * 9}{index}." for index in range(400)]
    first_sentences = [int(unit.split(" ")[0][9:-1]) for unit in ladder_units(story, 30)]
    assert first_sentences == sorted(first_sentences)
    assert first_sentences[-1] > 200


def test_too_short_story_is_refused_instead_of_measuring_fewer_clips():
    with pytest.raises(ValueError, match="만들 수 없습니다"):
        ladder_units([TEN] * 5, 60)


def test_a_sentence_longer_than_the_target_never_passes_as_a_short_unit():
    with pytest.raises(ValueError, match="만들 수 없습니다"):
        ladder_units(["가" * 100 + "."] * 20, 30)


def test_plan_covers_every_target_unit_and_seed_exactly_once():
    jobs = ladder_jobs(STORY)
    assert len(jobs) == len(TARGET_SYLLABLES) * UNITS_PER_TARGET * len(SEEDS)
    assert len({job_key(job) for job in jobs}) == len(jobs)
    assert {job.unit for job in jobs} == set(range(UNITS_PER_TARGET))


def test_retries_of_one_seed_never_reuse_another_seed():
    assert all(later - earlier >= MAX_ATTEMPTS * SEED_STEP for earlier, later in zip(SEEDS, SEEDS[1:]))


def test_resume_skips_only_finished_jobs():
    jobs = ladder_jobs(STORY)
    assert pending_jobs(jobs, {job_key(jobs[0])}) == jobs[1:]


@pytest.mark.parametrize(
    ("transcript", "lost"),
    [("옛날에 토끼가 살았습니다.", False), ("옛날에 토끼가 살", True), ("옛날에 토끼가 살았습니다 그리고 또", False)],
)
def test_lost_tail_looks_only_at_the_end(transcript: str, lost: bool):
    assert lost_tail("옛날에 토끼가 살았습니다.", transcript) is lost


def test_rows_group_by_target_and_count_problems():
    record = {"text": "가나다라마", "transcript": "가나다라마", "durationSec": 1.0, "cer": 0.0, "attempts": 1, "passed": True}
    rows = ladder_rows(
        [
            {**record, "target": 15},
            {**record, "target": 15, "attempts": 3, "passed": False, "transcript": "가", "cer": 0.8},
            {**record, "target": 30},
        ]
    )
    assert [(row.target, row.clips, row.retried, row.failed, row.tails_lost, row.omissions) for row in rows] == [
        (15, 2, 1, 1, 1, 1),
        (30, 1, 0, 0, 0, 0),
    ]
    assert rows[0].rate == pytest.approx(5.0)


def test_unit_is_the_closest_fit_not_the_first_above_the_lower_bound():
    assert [count_syllables(unit) for unit in ladder_units(["가나다라마."] * 200, 100)] == [100] * UNITS_PER_TARGET


def test_ladder_defaults_to_calm_and_condition_a():
    args = parse_ladder_args(["--plan-from", "p", "--speaker", "s1b", "--out", "o"])
    assert (args.style, args.condition) == ("calm", "A")


def test_ladder_measures_excited_from_a_phone_recording():
    args = parse_ladder_args(["--plan-from", "p", "--speaker", "s", "--out", "o", "--style", "excited", "--condition", "B"])
    assert (args.style, args.condition) == ("excited", "B")


def test_ladder_measures_soft_from_a_phone_recording():
    args = parse_ladder_args(["--plan-from", "p", "--speaker", "s3_phone", "--out", "o", "--style", "soft", "--condition", "B"])
    assert (args.style, args.condition) == ("soft", "B")


def test_ladder_skips_units_above_180_syllables_to_spend_clips_on_short_units():
    assert max(TARGET_SYLLABLES) == 180
    assert len(ladder_jobs(STORY)) == 84
