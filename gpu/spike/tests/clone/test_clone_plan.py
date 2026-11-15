from dataclasses import replace
from pathlib import Path

from spike.clone.catalog import load_eval_sentences, load_reference_scripts, script_for
from spike.clone.plan.clone_plan import CloneJob, PlanSettings, PrepareJob, missing_references, plan_clones, stale_outputs
from spike.clone.plan.experiment import load_experiments, select

SETTINGS = PlanSettings(recordings=Path("/rec"), outputs=Path("/out"), prep_version="v1")
SPEAKERS = ["p_sohee", "d_mom30"]


def _plan(experiment_ids: list[str], settings: PlanSettings = SETTINGS):
    experiments = select(load_experiments(), experiment_ids)
    return plan_clones(experiments, SPEAKERS, load_eval_sentences(), load_reference_scripts(), settings)


def _clones(jobs) -> list[CloneJob]:
    return [j for j in jobs if isinstance(j, CloneJob)]


def _prepares(jobs) -> list[PrepareJob]:
    return [j for j in jobs if isinstance(j, PrepareJob)]


def test_speaker_script_reaches_only_that_speakers_soft_reference():
    own_script = "녹음이 읽은 대본"
    settings = replace(SETTINGS, speaker_scripts={"p_sohee": {"soft": own_script}})
    product = script_for("soft", load_reference_scripts()).text

    texts = {
        (job.speaker_id, job.reference.text)
        for job in _clones(_plan(["baseline"], settings))
        if job.reference_style == "soft"
    }

    assert texts == {("p_sohee", own_script), ("d_mom30", product)}


def test_clone_count_is_speakers_by_conditions_by_sentences():
    assert len(_clones(_plan(["baseline"]))) == len(SPEAKERS) * 3 * len(load_eval_sentences())


def test_comparison_experiment_only_generates_affected_sentences():
    affected = [s for s in load_eval_sentences() if s.style in ("excited", "soft")]
    clones = _clones(_plan(["calm_only"]))
    assert len(clones) == len(SPEAKERS) * len(affected)
    assert all(c.sentence.style != "calm" for c in clones)


def test_all_prepare_jobs_come_before_any_clone_job():
    jobs = _plan(["baseline", "calm_only"])
    first_clone = next(i for i, j in enumerate(jobs) if isinstance(j, CloneJob))
    assert all(isinstance(j, PrepareJob) for j in jobs[:first_clone])


def test_each_reference_is_prepared_once():
    paths = [p.reference.prepared_path for p in _prepares(_plan(["baseline", "calm_only"]))]
    assert len(paths) == len(set(paths))


def test_prepared_reference_lives_under_prep_version():
    prepare = _prepares(_plan(["baseline"]))[0]
    assert "v1" in prepare.reference.prepared_path.parts


def test_calm_only_uses_calm_reference_for_excited_sentence():
    clone = next(j for j in _clones(_plan(["calm_only"])) if j.sentence.style == "excited")
    assert clone.reference.raw_path.name == "B_calm.m4a"


def test_whisper_for_soft_reads_whisper_script():
    whisper = next(s for s in load_reference_scripts() if s.style == "whisper")
    clone = _clones(_plan(["whisper_for_soft"]))[0]
    assert clone.reference.text == whisper.text and clone.reference.raw_path.name == "B_whisper.m4a"


def test_keys_are_unique_across_experiments():
    keys = [j.key for j in _clones(_plan([]))]
    assert len(keys) == len(set(keys))


def test_fingerprint_changes_when_prep_version_changes():
    before = _clones(_plan(["baseline"]))[0].fingerprint
    after = _clones(_plan(["baseline"], replace(SETTINGS, prep_version="v2")))[0].fingerprint
    assert before != after


def test_missing_references_lists_absent_recordings():
    jobs = _plan(["calm_only"])
    present = {p.reference.raw_path for p in _prepares(jobs)} - {Path("/rec/p_sohee/B_calm.m4a")}
    assert missing_references(jobs, lambda path: path in present) == [Path("/rec/p_sohee/B_calm.m4a")]


def test_stale_outputs_flags_existing_files_with_other_or_unknown_fingerprint():
    clones = _clones(_plan(["whisper_for_soft"]))
    fresh, changed, unknown = clones[0], clones[1], clones[2]
    meta = {fresh.key: {"fingerprint": fresh.fingerprint}, changed.key: {"fingerprint": "old"}}
    existing = {fresh.out_path, changed.out_path, unknown.out_path}
    assert stale_outputs(clones, meta, lambda path: path in existing) == [changed.key, unknown.key]


def test_clone_job_records_who_and_which_reference_style():
    clones = _clones(_plan(["calm_only"]))
    assert {c.speaker_id for c in clones} == set(SPEAKERS)
    assert {c.condition for c in clones} == {"B"}
    assert {c.reference_style for c in clones} == {"calm"}
