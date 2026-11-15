"""실험 × 화자 × 조건 × 문장 → 클론 작업 목록과 실행 전 검사. 파일도 모델도 건드리지 않는 순수 함수."""
import hashlib
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path

from spike.clone.catalog import EvalSentence, ReferenceScript, reference_text
from spike.clone.plan.experiment import Experiment
from spike.clone.layout import Condition, clone_output_path, prepared_reference_path, reference_path

FINGERPRINT_LENGTH = 12


@dataclass(frozen=True)
class Reference:
    raw_path: Path
    prepared_path: Path
    text: str


@dataclass(frozen=True)
class PrepareJob:
    reference: Reference


@dataclass(frozen=True)
class CloneJob:
    experiment: Experiment
    speaker_id: str
    condition: Condition
    reference_style: str
    reference: Reference
    sentence: EvalSentence
    out_path: Path
    key: str
    fingerprint: str


@dataclass(frozen=True)
class PlanSettings:
    recordings: Path
    outputs: Path
    prep_version: str
    speaker_scripts: Mapping[str, Mapping[str, str]] = field(default_factory=dict, hash=False)


def plan_clones(
    experiments: list[Experiment],
    speaker_ids: list[str],
    sentences: list[EvalSentence],
    scripts: list[ReferenceScript],
    settings: PlanSettings,
) -> list[PrepareJob | CloneJob]:
    """전처리 작업이 항상 클론 작업보다 앞에 온다. 같은 참조는 한 번만 전처리한다."""
    clones = [
        _clone_job(experiment, speaker_id, condition, sentence, scripts, settings)
        for experiment in experiments
        for speaker_id in speaker_ids
        for condition in experiment.conditions
        for sentence in sentences
        if experiment.includes(sentence.style)
    ]
    references = dict.fromkeys(job.reference for job in clones)
    return [*(PrepareJob(reference) for reference in references), *clones]


def _clone_job(
    experiment: Experiment,
    speaker_id: str,
    condition: Condition,
    sentence: EvalSentence,
    scripts: list[ReferenceScript],
    settings: PlanSettings,
) -> CloneJob:
    style = experiment.reference_style(sentence.style)
    reference = Reference(
        raw_path=reference_path(settings.recordings, speaker_id, condition, style),
        prepared_path=prepared_reference_path(settings.outputs, settings.prep_version, speaker_id, condition, style),
        text=reference_text(style, scripts, settings.speaker_scripts.get(speaker_id, {})),
    )
    out_path = clone_output_path(settings.outputs, experiment.id, speaker_id, condition, sentence.id)
    key = str(out_path.relative_to(settings.outputs))
    fingerprint = _fingerprint(experiment, reference, sentence)
    return CloneJob(experiment, speaker_id, condition, style, reference, sentence, out_path, key, fingerprint)


def _fingerprint(experiment: Experiment, reference: Reference, sentence: EvalSentence) -> str:
    """결과를 바꾸는 입력 전부. 하나라도 바뀌면 기존 출력은 재사용할 수 없다."""
    inputs = {
        "engine": experiment.engine,
        "model": experiment.model,
        "nonStreaming": experiment.non_streaming,
        "xVectorOnly": experiment.x_vector_only,
        "seed": experiment.seed,
        "reference": str(reference.prepared_path),
        "referenceText": reference.text,
        "text": sentence.text,
    }
    digest = hashlib.sha256(json.dumps(inputs, sort_keys=True, ensure_ascii=False).encode())
    return digest.hexdigest()[:FINGERPRINT_LENGTH]


def missing_references(jobs: list[PrepareJob | CloneJob], exists: Callable[[Path], bool]) -> list[Path]:
    return [job.reference.raw_path for job in jobs if isinstance(job, PrepareJob) and not exists(job.reference.raw_path)]


def stale_outputs(
    jobs: list[PrepareJob | CloneJob], meta: Mapping[str, dict], exists: Callable[[Path], bool]
) -> list[str]:
    """이미 있는 출력 중 지금 설정으로 만들지 않은 것. 메타가 없으면 어떤 설정이었는지 알 수 없어 낡은 것으로 본다."""
    clones = [job for job in jobs if isinstance(job, CloneJob) and exists(job.out_path)]
    return [job.key for job in clones if meta.get(job.key, {}).get("fingerprint") != job.fingerprint]


def clone_keys(jobs: list[PrepareJob | CloneJob]) -> set[str]:
    return {job.key for job in jobs if isinstance(job, CloneJob)}
