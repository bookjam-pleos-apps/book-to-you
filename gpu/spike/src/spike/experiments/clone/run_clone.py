"""실험별로 클론을 생성한다. 실행 전에 run_preflight와 같은 점검을 하고, 끝나면 계획 전체를 요약한다.

사용: uv run --extra gpu python -m spike.experiments.clone.run_clone [--experiments baseline calm_only] [--speakers p_sohee]
"""
import json

from spike.clone.cli_output import abort_if
from spike.evaluation.clone_eval.cli_plan import parse_plan_args, plan_from_args
from spike.clone.plan.clone_plan import clone_keys
from spike.clone.plan.clone_runner import load_meta, run_jobs
from spike.clone.plan.clone_summary import summarize
from spike.compose.engine_backends import ENGINE_FACTORIES, load_engines, reference_preparer
from spike.clone.plan.experiment import unknown_engines
from spike.evaluation.clone_eval.preflight import blocking_problems
from spike.evaluation.clone_eval.workspace_check import inspect_workspace


def main() -> None:
    run = plan_from_args(parse_plan_args())
    abort_if(unknown_engines(run.experiments, ENGINE_FACTORIES), "등록되지 않은 엔진:")
    abort_if(blocking_problems(inspect_workspace(run)), "실행 전에 해결할 문제 (자세한 목록은 run_preflight):")
    engine_ids = [experiment.engine for experiment in run.experiments]
    tally = run_jobs(run.jobs, load_engines(engine_ids), run.outputs, reference_preparer(engine_ids))
    meta = load_meta(run.outputs)
    planned = {key: meta[key] for key in clone_keys(run.jobs) if key in meta}
    print(f"이번 실행에서 생성: {len(tally.generated)}개")
    print(json.dumps(summarize(planned), indent=2))


if __name__ == "__main__":
    main()
