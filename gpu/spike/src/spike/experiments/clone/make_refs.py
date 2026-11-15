"""합성 화자별 참조(A·B·C)와 천장 문장을 만든다. 이미 있는 파일은 건너뛰어 재실행해도 이어서 진행된다.

사용: uv run --extra gpu python -m spike.experiments.clone.make_refs [--seed 1234] [--threshold 0.6]
"""
import argparse
import json
from dataclasses import dataclass, field, replace
from functools import partial, reduce
from pathlib import Path

import numpy as np
import soundfile as sf

from spike.sound.atomic import atomic_path
from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.clone.catalog import Speaker, load_eval_sentences, load_reference_scripts, load_speakers
from spike.clone.reference.consistency import ConsistencyPolicy, Voice, generate_consistent
from spike.clone.reference.degrade import degrade
from spike.clone.identity import Embedder
from spike.clone.layout import RECORDINGS_DIR, reference_meta_path
from spike.clone.meta_store import merge_meta
from spike.clone.reference.ref_plan import DegradeJob, Job, SynthJob, plan_speaker
from spike.clone.reference.reference_voice import voice_for
from spike.clone.scoring.speaker_embedding import EcapaEmbedder


@dataclass(frozen=True)
class SpeakerContext:
    voice: Voice
    embedder: Embedder
    base_seed: int
    policy: ConsistencyPolicy


@dataclass(frozen=True)
class RunState:
    anchor: np.ndarray | None = None
    meta: dict[str, dict] = field(default_factory=dict)


def _with_anchor(context: SpeakerContext, state: RunState, audio: Audio) -> RunState:
    if state.anchor is not None:
        return state
    return replace(state, anchor=context.embedder.embed(audio))


def _run_job(context: SpeakerContext, state: RunState, job: Job) -> RunState:
    if isinstance(job, DegradeJob):
        _degrade_if_missing(job)
        return state
    if job.path.exists():
        return _with_anchor(context, state, read_audio(job.path))
    return _synthesize(context, state, job)


def _synthesize(context: SpeakerContext, state: RunState, job: SynthJob) -> RunState:
    result = generate_consistent(
        context.voice, context.embedder, job.text, job.instruct, state.anchor, context.base_seed,
        _policy_for(context.policy, job),
    )
    with atomic_path(job.path) as tmp:
        sf.write(tmp, result.audio.samples, result.audio.sample_rate)
    print(f"wrote {job.path} similarity={result.similarity:.3f}")
    entry = {"seed": result.seed, "similarity": round(result.similarity, 4), "identityOk": result.identity_ok}
    return _with_anchor(context, replace(state, meta={**state.meta, job.path.name: entry}), result.audio)


def _policy_for(policy: ConsistencyPolicy, job: SynthJob) -> ConsistencyPolicy:
    """스타일별 임계값(data/reference-scripts.json)이 실행 기본값(--threshold)보다 우선한다."""
    if job.identity_threshold is None:
        return policy
    return replace(policy, threshold=job.identity_threshold)


def _degrade_if_missing(job: DegradeJob) -> None:
    if job.dst.exists():
        return
    degrade(job.src, job.dst, job.profile)


def run_speaker(speaker: Speaker, embedder: Embedder, root: Path, base_seed: int, policy: ConsistencyPolicy) -> RunState:
    context = SpeakerContext(voice_for(speaker), embedder, base_seed, policy)
    jobs = plan_speaker(root, speaker.id, load_reference_scripts(), load_eval_sentences())
    final = reduce(partial(_run_job, context), jobs, RunState())
    merge_meta(reference_meta_path(root, speaker.id), final.meta)
    return final


def _identity_failures(state: RunState) -> list[str]:
    return [name for name, entry in state.meta.items() if not entry["identityOk"]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--threshold", type=float, default=0.6)
    parser.add_argument("--out", type=Path, default=RECORDINGS_DIR)
    args = parser.parse_args()
    run = partial(run_speaker, embedder=EcapaEmbedder(), root=args.out, base_seed=args.seed,
                  policy=ConsistencyPolicy(threshold=args.threshold))
    states = {s.id: run(s) for s in load_speakers() if s.source != "recorded"}
    failures = {speaker_id: _identity_failures(state) for speaker_id, state in states.items()}
    print(json.dumps({"identityFailures": failures}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
