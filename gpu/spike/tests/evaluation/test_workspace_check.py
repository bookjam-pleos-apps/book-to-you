from argparse import Namespace
from pathlib import Path

from spike.evaluation.clone_eval.cli_plan import plan_from_args
from spike.clone.plan.clone_plan import CloneJob
from spike.evaluation.clone_eval.preflight import blocking_problems
from spike.evaluation.clone_eval.workspace_check import inspect_workspace


def test_stale_output_in_workspace_blocks_the_run(tmp_path: Path):
    run = plan_from_args(Namespace(experiments=["calm_only"], speakers=["p_sohee"], out=tmp_path))
    first = next(job for job in run.jobs if isinstance(job, CloneJob))
    first.out_path.parent.mkdir(parents=True)
    first.out_path.write_bytes(b"")
    report = inspect_workspace(run)
    assert report.stale_outputs == [first.key]
    assert any("다른 설정" in problem for problem in blocking_problems(report))
