"""평가할 클론과 화자별 천장값 녹음을 고른다. 파일도 모델도 건드리지 않는 순수 함수."""
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

from spike.clone.catalog import EvalSentence
from spike.clone.plan.clone_plan import CloneJob, PrepareJob
from spike.evaluation.clone_eval.evaluator import EVAL_VERSION
from spike.clone.reference.identity_gate import Gates, gate_fingerprint
from spike.clone.layout import ceiling_path


@dataclass(frozen=True)
class CeilingClip:
    sentence: EvalSentence
    path: Path


def pending_evaluations(
    jobs: list[PrepareJob | CloneJob],
    clone_meta: Mapping[str, dict],
    eval_meta: Mapping[str, dict],
    gates: Gates,
    exists: Callable[[Path], bool],
) -> list[CloneJob]:
    """지금 설정으로 생성됐고 지금 평가기로 아직 재지 않은 클론. 예전 설정의 출력을 지금 결과로 기록하지 않는다."""
    return [
        job for job in jobs
        if isinstance(job, CloneJob)
        and exists(job.out_path)
        and _fingerprint_of(clone_meta, job) == job.fingerprint
        and not _is_current_evaluation(eval_meta, gates, job)
    ]


def _fingerprint_of(meta: Mapping[str, dict], job: CloneJob) -> str | None:
    return meta.get(job.key, {}).get("fingerprint")


def _is_current_evaluation(eval_meta: Mapping[str, dict], gates: Gates, job: CloneJob) -> bool:
    """지금 출력을 지금 평가기와 지금 게이트 판정으로 잰 결과. 셋 중 하나라도 바뀌면 다시 잰다."""
    entry = eval_meta.get(job.key, {})
    return (
        entry.get("fingerprint") == job.fingerprint
        and entry.get("evalVersion") == EVAL_VERSION
        and entry.get("gateFingerprint") == gate_fingerprint(gates.get(job.speaker_id, {}))
    )


def ceiling_clips(
    speaker_id: str, sentences: list[EvalSentence], recordings: Path, exists: Callable[[Path], bool]
) -> list[CeilingClip]:
    clips = (CeilingClip(s, ceiling_path(recordings, speaker_id, s.id)) for s in sentences if s.ceiling)
    return [clip for clip in clips if exists(clip.path)]


def current_evaluations(
    jobs: list[PrepareJob | CloneJob], eval_meta: Mapping[str, dict], gates: Gates
) -> dict[str, dict]:
    """계획에 있고 지금 출력을 지금 평가기로 잰 평가만. 출력이 다시 생성됐거나 평가기가 바뀐 예전 평가는 요약에서 뺀다."""
    return {
        job.key: eval_meta[job.key]
        for job in jobs
        if isinstance(job, CloneJob) and _is_current_evaluation(eval_meta, gates, job)
    }
