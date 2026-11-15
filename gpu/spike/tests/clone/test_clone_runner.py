from pathlib import Path

import numpy as np
import pytest

from spike.sound.audio import Audio
from spike.clone.catalog import load_eval_sentences, load_reference_scripts
from spike.clone.plan.clone_plan import CloneJob, PlanSettings, PrepareJob, Reference, plan_clones, stale_outputs
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.clone.plan.clone_runner import load_meta, run_jobs
from spike.clone.plan.experiment import select, load_experiments

SAMPLE_RATE = 24000


class FakeEngine:
    def __init__(self):
        self.requests: list[CloneRequest] = []

    def synthesize(self, request: CloneRequest) -> Synthesis:
        self.requests.append(request)
        return Synthesis(Audio(np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE), gen_ms=500)


def _clone_jobs(outputs: Path) -> list[CloneJob]:
    settings = PlanSettings(recordings=outputs / "rec", outputs=outputs, prep_version="v1")
    sentences = load_eval_sentences()[:2]
    jobs = plan_clones(select(load_experiments(), ["streaming_default"]), ["p_sohee"], sentences,
                       load_reference_scripts(), settings)
    return [j for j in jobs if isinstance(j, CloneJob)]


def test_writes_audio_and_meta_with_fingerprint(tmp_path: Path):
    jobs = _clone_jobs(tmp_path)
    tally = run_jobs(jobs, {"qwen3-base": FakeEngine()}, tmp_path)
    meta = load_meta(tmp_path)
    assert tally.generated == tuple(j.key for j in jobs)
    assert all(j.out_path.exists() for j in jobs)
    assert all(meta[j.key]["fingerprint"] == j.fingerprint for j in jobs)
    assert meta[jobs[0].key]["speedX"] == 2.0


def test_rerun_skips_existing_outputs(tmp_path: Path):
    jobs = _clone_jobs(tmp_path)
    run_jobs(jobs, {"qwen3-base": FakeEngine()}, tmp_path)
    engine = FakeEngine()
    assert run_jobs(jobs, {"qwen3-base": engine}, tmp_path).generated == ()
    assert engine.requests == []


def test_request_carries_experiment_settings(tmp_path: Path):
    jobs = _clone_jobs(tmp_path)
    engine = FakeEngine()
    run_jobs(jobs[:1], {"qwen3-base": engine}, tmp_path)
    request = engine.requests[0]
    assert request.non_streaming is False and request.reference_path == jobs[0].reference.prepared_path


def test_missing_meta_file_reads_as_empty(tmp_path: Path):
    assert load_meta(tmp_path) == {}


def test_interruption_while_saving_never_leaves_audio_without_meta(tmp_path: Path, monkeypatch):
    jobs = _clone_jobs(tmp_path)[:1]
    monkeypatch.setattr("spike.clone.plan.clone_runner.merge_meta", _raise_interrupt)
    with pytest.raises(KeyboardInterrupt):
        run_jobs(jobs, {"qwen3-base": FakeEngine()}, tmp_path)
    assert not jobs[0].out_path.exists()
    assert stale_outputs(jobs, load_meta(tmp_path), Path.exists) == []


def _raise_interrupt(*_args: object) -> None:
    raise KeyboardInterrupt


def test_run_jobs_prepares_references_with_the_given_function(tmp_path: Path):
    prepared: list[tuple[Path, Path]] = []
    jobs = [PrepareJob(Reference(tmp_path / "raw.wav", tmp_path / "prepared.wav", "대본"))]

    run_jobs(jobs, {}, tmp_path, lambda src, dst: prepared.append((src, dst)))

    assert prepared == [(jobs[0].reference.raw_path, jobs[0].reference.prepared_path)]
