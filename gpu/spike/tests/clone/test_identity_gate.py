from pathlib import Path

from spike.clone.catalog import load_eval_sentences, load_reference_scripts
from spike.clone.plan.clone_plan import CloneJob, PlanSettings, plan_clones
from spike.clone.plan.experiment import load_experiments
from spike.clone.reference.identity_gate import gate_fields, gate_fingerprint, passed_identity_gate

SETTINGS = PlanSettings(recordings=Path("/rec"), outputs=Path("/out"), prep_version="v1")


def _degraded_clone() -> CloneJob:
    jobs = plan_clones(load_experiments(), ["d_dad30"], load_eval_sentences(), load_reference_scripts(), SETTINGS)
    return next(j for j in jobs if isinstance(j, CloneJob) and j.condition != "A")


def test_identity_gate_follows_the_recorded_verdict():
    gate = {"A_ceil_t01.wav": {"identityOk": True}, "A_ceil_t02.wav": {"identityOk": False}}
    assert passed_identity_gate(gate, Path("/rec/p_sohee/A_ceil_t01.wav"))
    assert not passed_identity_gate(gate, Path("/rec/p_sohee/A_ceil_t02.wav"))
    assert passed_identity_gate(gate, Path("/rec/p_sohee/A_ceil_t03.wav"))


def test_degraded_reference_inherits_the_verdict_of_its_clean_source():
    job = _degraded_clone()
    gates = {"d_dad30": {f"A_{job.reference_style}.wav": {"identityOk": False}}}
    assert gate_fields(gates, job)["referenceIdentityOk"] is False


def test_gate_fingerprint_changes_only_with_the_verdicts():
    passed = {"A_calm.wav": {"identityOk": True, "similarity": 1.0}}
    assert gate_fingerprint(passed) == gate_fingerprint({"A_calm.wav": {"identityOk": True, "similarity": 0.9}})
    assert gate_fingerprint(passed) != gate_fingerprint({"A_calm.wav": {"identityOk": False}})
