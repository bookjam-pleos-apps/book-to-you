"""클론 계획을 실행한다. 엔진은 주입받으므로 가짜 엔진으로 테스트할 수 있다."""
from collections.abc import Mapping
from dataclasses import dataclass, replace
from functools import partial, reduce
from pathlib import Path

import soundfile as sf

from spike.sound.atomic import atomic_path
from spike.clone.budget import reached_budget
from spike.clone.plan.clone_plan import CloneJob, PrepareJob
from spike.clone.engine.clone_port import CloneEngine, CloneRequest, Synthesis
from spike.clone.meta_store import merge_meta, read_meta
from spike.clone.reference.ref_prep import PrepareReference, prepare_reference

META_FILE = "clone_meta.json"
MIN_GEN_SEC = 1e-3


@dataclass(frozen=True)
class RunTally:
    generated: tuple[str, ...] = ()


def run_jobs(
    jobs: list[PrepareJob | CloneJob],
    engines: Mapping[str, CloneEngine],
    outputs: Path,
    prepare: PrepareReference = prepare_reference,
) -> RunTally:
    return reduce(partial(_run_job, engines, outputs, prepare), jobs, RunTally())


def load_meta(outputs: Path) -> dict[str, dict]:
    return read_meta(outputs / META_FILE)


def _run_job(
    engines: Mapping[str, CloneEngine],
    outputs: Path,
    prepare: PrepareReference,
    tally: RunTally,
    job: PrepareJob | CloneJob,
) -> RunTally:
    if isinstance(job, PrepareJob):
        prepare(job.reference.raw_path, job.reference.prepared_path)
        return tally
    if job.out_path.exists():
        return tally
    result = engines[job.experiment.engine].synthesize(_request(job))
    entry = _meta_entry(job, result)
    # 메타를 wav보다 먼저 쓴다. 사이에서 멈추면 wav가 없어 재생성되고, 반대 순서면 메타 없는 wav가 낡은 출력으로 막힌다.
    merge_meta(outputs / META_FILE, {job.key: entry})
    _write_wav(job.out_path, result)
    print(f"wrote {job.key} speedX={entry['speedX']}")
    return replace(tally, generated=(*tally.generated, job.key))


def _request(job: CloneJob) -> CloneRequest:
    experiment = job.experiment
    return CloneRequest(
        text=job.sentence.text,
        reference_path=job.reference.prepared_path,
        reference_text=job.reference.text,
        model=experiment.model,
        seed=experiment.seed,
        non_streaming=experiment.non_streaming,
        x_vector_only=experiment.x_vector_only,
    )


def _write_wav(path: Path, result: Synthesis) -> None:
    with atomic_path(path) as tmp:
        sf.write(tmp, result.audio.samples, result.audio.sample_rate)


def _meta_entry(job: CloneJob, result: Synthesis) -> dict:
    duration = result.audio.duration_sec
    return {
        "experiment": job.experiment.id,
        "fingerprint": job.fingerprint,
        "seed": job.experiment.seed,
        "durationSec": round(duration, 3),
        "genMs": result.gen_ms,
        "speedX": round(duration / max(result.gen_ms / 1000, MIN_GEN_SEC), 2),
        "hitBudget": reached_budget(duration, job.sentence.text),
    }
