from pathlib import Path

from spike.clone.catalog import load_eval_sentences, load_reference_scripts
from spike.clone.plan.clone_plan import CloneJob, PlanSettings, plan_clones
from spike.evaluation.clone_eval.eval_plan import ceiling_clips, current_evaluations, pending_evaluations
from spike.evaluation.clone_eval.evaluator import EVAL_VERSION
from spike.clone.plan.experiment import load_experiments, select
from spike.clone.reference.identity_gate import gate_fingerprint

SETTINGS = PlanSettings(recordings=Path("/rec"), outputs=Path("/out"), prep_version="v1")


def _jobs():
    return plan_clones(select(load_experiments(), ["calm_only"]), ["p_sohee"], load_eval_sentences(),
                       load_reference_scripts(), SETTINGS)


def _clones() -> list[CloneJob]:
    return [j for j in _jobs() if isinstance(j, CloneJob)]


def _generated_now() -> dict[str, dict]:
    return {job.key: {"fingerprint": job.fingerprint} for job in _clones()}


def _evaluated_now(job: CloneJob) -> dict:
    return {"fingerprint": job.fingerprint, "evalVersion": EVAL_VERSION, "gateFingerprint": gate_fingerprint({})}


def test_only_existing_outputs_are_evaluated():
    first = _clones()[0]
    pending = pending_evaluations(_jobs(), _generated_now(), {}, {}, lambda path: path == first.out_path)
    assert pending == [first]


def test_outputs_evaluated_with_same_fingerprint_are_skipped():
    first, second = _clones()[:2]
    eval_meta = {first.key: _evaluated_now(first), second.key: {"fingerprint": "old", "evalVersion": EVAL_VERSION}}
    assert pending_evaluations(_jobs(), _generated_now(), eval_meta, {}, lambda _: True) == _clones()[1:]


def test_outputs_generated_with_other_settings_are_not_evaluated():
    first = _clones()[0]
    clone_meta = {**_generated_now(), first.key: {"fingerprint": "old"}}
    pending = pending_evaluations(_jobs(), clone_meta, {}, {}, lambda _: True)
    assert first not in pending and len(pending) == len(_clones()) - 1


def test_outputs_without_clone_meta_are_not_evaluated():
    assert pending_evaluations(_jobs(), {}, {}, {}, lambda _: True) == []


def test_summary_input_drops_stale_and_unplanned_evaluations():
    first, second = _clones()[:2]
    eval_meta = {
        first.key: _evaluated_now(first),
        second.key: {"fingerprint": "old", "evalVersion": EVAL_VERSION},
        "other/x.wav": {"fingerprint": "any"},
    }
    assert current_evaluations(_jobs(), eval_meta, {}) == {first.key: _evaluated_now(first)}


def test_evaluations_from_an_older_evaluator_are_redone_and_left_out_of_the_summary():
    first, second = _clones()[:2]
    eval_meta = {first.key: _evaluated_now(first), second.key: {"fingerprint": second.fingerprint}}
    assert second in pending_evaluations(_jobs(), _generated_now(), eval_meta, {}, lambda _: True)
    assert first not in pending_evaluations(_jobs(), _generated_now(), eval_meta, {}, lambda _: True)
    assert list(current_evaluations(_jobs(), eval_meta, {})) == [first.key]


def test_ceiling_clips_are_ceiling_sentences_with_recordings():
    sentences = load_eval_sentences()
    clips = ceiling_clips("p_sohee", sentences, Path("/rec"), lambda _: True)
    assert [c.sentence for c in clips] == [s for s in sentences if s.ceiling]
    assert ceiling_clips("p_sohee", sentences, Path("/rec"), lambda _: False) == []



def test_evaluations_are_redone_when_the_identity_gate_verdicts_change():
    first = _clones()[0]
    gates = {"p_sohee": {"A_calm.wav": {"identityOk": False}}}
    assert first in pending_evaluations(_jobs(), _generated_now(), {first.key: _evaluated_now(first)}, gates, lambda _: True)
