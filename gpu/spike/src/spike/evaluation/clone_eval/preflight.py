"""GPU를 잡기 전에 계획을 점검한다. 녹음 누락·낡은 출력·도구 누락을 모델 없이 찾아낸다. 순수 함수."""
from collections import Counter
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

from spike.clone.catalog import EvalSentence
from spike.clone.plan.clone_plan import CloneJob, PrepareJob, missing_references, stale_outputs
from spike.evaluation.clone_eval.eval_plan import pending_evaluations
from spike.clone.reference.identity_gate import Gates
from spike.clone.layout import ceiling_path

REQUIRED_TOOLS = ("ffmpeg",)


@dataclass(frozen=True)
class PreflightInputs:
    jobs: list[PrepareJob | CloneJob]
    speaker_ids: list[str]
    sentences: list[EvalSentence]
    recordings: Path
    clone_meta: Mapping[str, dict]
    eval_meta: Mapping[str, dict]
    gates: Gates


@dataclass(frozen=True)
class PreflightReport:
    clones_by_experiment: dict[str, int]
    to_generate: int
    to_evaluate: int
    missing_references: list[Path]
    stale_outputs: list[str]
    missing_ceilings: dict[str, list[Path]]
    missing_tools: list[str]


def build_report(
    inputs: PreflightInputs, exists: Callable[[Path], bool], tool_available: Callable[[str], bool]
) -> PreflightReport:
    clones = [job for job in inputs.jobs if isinstance(job, CloneJob)]
    return PreflightReport(
        clones_by_experiment=dict(Counter(job.experiment.id for job in clones)),
        to_generate=sum(not exists(job.out_path) for job in clones),
        to_evaluate=len(pending_evaluations(inputs.jobs, inputs.clone_meta, inputs.eval_meta, inputs.gates, exists)),
        missing_references=missing_references(inputs.jobs, exists),
        stale_outputs=stale_outputs(inputs.jobs, inputs.clone_meta, exists),
        missing_ceilings=_missing_ceilings(inputs, exists),
        missing_tools=[tool for tool in REQUIRED_TOOLS if not tool_available(tool)],
    )


def _missing_ceilings(inputs: PreflightInputs, exists: Callable[[Path], bool]) -> dict[str, list[Path]]:
    """천장 녹음이 빠지면 그 스타일의 말속도와 화자 유사도 기준값이 비어 판정이 보류된다."""
    missing = {speaker_id: _missing_ceilings_of(inputs, speaker_id, exists) for speaker_id in inputs.speaker_ids}
    return {speaker_id: paths for speaker_id, paths in missing.items() if paths}


def _missing_ceilings_of(inputs: PreflightInputs, speaker_id: str, exists: Callable[[Path], bool]) -> list[Path]:
    paths = (ceiling_path(inputs.recordings, speaker_id, s.id) for s in inputs.sentences if s.ceiling)
    return [path for path in paths if not exists(path)]


def blocking_problems(report: PreflightReport) -> list[str]:
    """GPU 실행을 막아야 하는 문제. 비어 있으면 진행해도 된다.

    참조·도구 누락과 낡은 출력은 run_clone이 GPU를 잡은 뒤 중단되는 조건이라 미리 막는다.
    천장 녹음 누락은 판정 일부만 보류되고, 나중에 녹음을 채워 다시 평가할 수 있어 막지 않는다.
    """
    counted = [
        (len(report.missing_references), "참조 녹음 {}개 누락"),
        (len(report.stale_outputs), "다른 설정으로 만든 출력 {}개 (지우거나 실험 id 변경)"),
    ]
    tools = [f"도구 설치 필요: {tool}" for tool in report.missing_tools]
    return [message.format(count) for count, message in counted if count] + tools
