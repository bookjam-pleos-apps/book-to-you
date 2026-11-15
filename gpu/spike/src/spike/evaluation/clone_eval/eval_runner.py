"""평가 계획을 실행한다. wav를 읽고 지표를 eval_meta.json에 누적하므로, 중단 후 다시 돌리면 남은 것만 평가한다."""
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from functools import partial, reduce
from pathlib import Path

import numpy as np

from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.clone.catalog import ANCHOR_STYLE, EvalSentence
from spike.clone.plan.clone_plan import CloneJob
from spike.evaluation.clone_eval.discriminability import MIN_MARGIN, discriminates, discrimination_margin
from spike.evaluation.clone_eval.eval_plan import CeilingClip, ceiling_clips
from spike.evaluation.clone_eval.evaluator import Scorers, SpeakerBaseline, evaluate_clone, speaker_baseline
from spike.clone.reference.identity_gate import Gate, Gates, gate_fields, passed_identity_gate
from spike.clone.identity import Embedder
from spike.clone.layout import reference_meta_path, reference_path
from spike.clone.meta_store import merge_meta, read_meta

EVAL_META_FILE = "eval_meta.json"


@dataclass(frozen=True)
class EvalContext:
    scorers: Scorers
    baselines: Mapping[str, SpeakerBaseline]
    clone_meta: Mapping[str, dict]
    gates: Gates
    outputs: Path


def load_eval_meta(outputs: Path) -> dict[str, dict]:
    return read_meta(outputs / EVAL_META_FILE)


def load_reference_gates(recordings: Path, speaker_ids: list[str]) -> dict[str, dict[str, dict]]:
    return {speaker_id: read_meta(reference_meta_path(recordings, speaker_id)) for speaker_id in speaker_ids}


def load_baselines(
    speaker_ids: list[str],
    sentences: list[EvalSentence],
    recordings: Path,
    gates: Gates,
    scorers: Scorers,
    exists: Callable[[Path], bool] = Path.exists,
    load: Callable[[Path], Audio] = read_audio,
) -> dict[str, SpeakerBaseline]:
    baselines = {
        speaker_id: speaker_baseline(
            [(clip.sentence, load(clip.path)) for clip in _gated_ceiling_clips(speaker_id, sentences, recordings, gates.get(speaker_id, {}), exists)],
            scorers,
        )
        for speaker_id in speaker_ids
    }
    calms = _calm_embeddings(speaker_ids, recordings, scorers.embedder, exists, load)
    return {speaker_id: _discriminating(speaker_id, baseline, calms) for speaker_id, baseline in baselines.items()}


def _calm_embeddings(
    speaker_ids: list[str], recordings: Path, embedder: Embedder, exists: Callable[[Path], bool], load: Callable[[Path], Audio]
) -> dict[str, np.ndarray]:
    paths = {speaker_id: reference_path(recordings, speaker_id, "A", ANCHOR_STYLE) for speaker_id in speaker_ids}
    return {speaker_id: embedder.embed(load(path)) for speaker_id, path in paths.items() if exists(path)}


def _discriminating(speaker_id: str, baseline: SpeakerBaseline, calms: Mapping[str, np.ndarray]) -> SpeakerBaseline:
    """기준점이 다른 화자의 calm과 가르지 못하면 화자 유사도 기준만 비운다. 말속도·운율 기준은 동일인과 무관해 둔다."""
    own = calms.get(speaker_id)
    if baseline.anchor is None or own is None:
        return baseline
    margin = discrimination_margin(baseline.anchor, own, [e for sid, e in calms.items() if sid != speaker_id])
    if discriminates(margin):
        return baseline
    print(f"기준점 변별력 부족 {speaker_id}: 여유 {margin:.3f} < {MIN_MARGIN}, 이 화자의 simRatio는 판정하지 않습니다")
    return replace(baseline, anchor=None, ceiling_similarity=None)


def _gated_ceiling_clips(
    speaker_id: str, sentences: list[EvalSentence], recordings: Path, gate: Gate, exists: Callable[[Path], bool]
) -> list[CeilingClip]:
    return ceiling_clips(speaker_id, sentences, recordings, lambda path: exists(path) and passed_identity_gate(gate, path))


def run_evaluations(jobs: list[CloneJob], context: EvalContext) -> tuple[str, ...]:
    return reduce(partial(_evaluate_one, context), jobs, ())


def _evaluate_one(context: EvalContext, done: tuple[str, ...], job: CloneJob) -> tuple[str, ...]:
    hit_budget = context.clone_meta[job.key]["hitBudget"]
    baseline = context.baselines.get(job.speaker_id, SpeakerBaseline())
    entry = {
        **evaluate_clone(job, read_audio(job.out_path), hit_budget, context.scorers, baseline),
        **gate_fields(context.gates, job),
    }
    merge_meta(context.outputs / EVAL_META_FILE, {job.key: entry})
    print(f"evaluated {job.key} cer={entry['cer']} simRatio={entry['simRatio']}")
    return (*done, job.key)
