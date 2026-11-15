"""계획을 실제 작업 폴더와 대조한다. run_preflight와 run_clone이 같은 판정을 쓰게 하는 IO 경계. torch를 import하지 않는다."""
import shutil
from pathlib import Path

from spike.evaluation.clone_eval.cli_plan import PlannedRun
from spike.clone.plan.clone_runner import load_meta
from spike.evaluation.clone_eval.eval_runner import load_eval_meta, load_reference_gates
from spike.evaluation.clone_eval.preflight import PreflightInputs, PreflightReport, build_report


def inspect_workspace(run: PlannedRun) -> PreflightReport:
    inputs = PreflightInputs(run.jobs, run.speaker_ids, run.sentences, run.recordings,
                             load_meta(run.outputs), load_eval_meta(run.outputs),
                             load_reference_gates(run.recordings, run.speaker_ids))
    return build_report(inputs, Path.exists, _tool_available)


def _tool_available(name: str) -> bool:
    return shutil.which(name) is not None
