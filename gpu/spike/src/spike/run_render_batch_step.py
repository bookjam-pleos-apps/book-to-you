"""compose 워크플로우 render-batch의 shell 단계. 배치 하나의 clone 입력(spec)과 뒤처리 단계의 결과를 JSON 한 줄로 stdout에 쓴다.

실패 처리와 작업 폴더 확인은 run_render_step과 같다(spike.compose.shell_step). 생성음 저장은 단위마다 run_render_step이 하고,
뒤처리(tails → cut → segments → qc)는 배치 전체를 한 번에 한다(batch_take_steps).
사용: python -m spike.run_render_batch_step spec --job=DIR --units='[3,5,8]' --attempt=0
      python -m spike.run_render_batch_step tails|cut|segments|qc --job=DIR --units='[3,5,8]' --attempt=0 [--texts='[...]'] [--vad='[...]']
"""
import argparse
import json
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path

from spike.compose import batch_take_steps
from spike.render.batch.batch_spec import batch_spec
from spike.render.attempt.render_attempts import attempt_spec
from spike.render.job.render_job import job_units, load_render_job
from spike.compose.unit_steps import clear_earlier_attempts
from spike.compose.shell_step import run_json_step


def step_spec(args: argparse.Namespace) -> dict:
    """첫 시도면 이전 실행이 남긴 그 단위들의 시도 파일을 지운다(단위별 render-spec과 같음)."""
    job = load_render_job(args.job)
    units, indices = job_units(job), json.loads(args.units)
    specs = [attempt_spec(args.job, job, units, index, args.attempt) for index in indices]
    cleared = [name for index in indices for name in clear_earlier_attempts(args.job, index)] if args.attempt == 0 else []
    return {**asdict(batch_spec(str(args.job.resolve()), specs)), "cleared": cleared}


STEPS = {
    "spec": step_spec,
    "tails": batch_take_steps.step_tails,
    "cut": batch_take_steps.step_cut,
    "segments": batch_take_steps.step_segments,
    "qc": batch_take_steps.step_qc,
}


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=sorted(STEPS))
    parser.add_argument("--job", type=Path, required=True)
    parser.add_argument("--units", required=True)
    parser.add_argument("--attempt", type=int, required=True)
    parser.add_argument("--texts", default="[]")
    parser.add_argument("--vad", default="[]")
    return parser.parse_args(argv)


def run_step(args: argparse.Namespace) -> int:
    return run_json_step(lambda: STEPS[args.step](args))


def main() -> None:
    raise SystemExit(run_step(parse_args()))


if __name__ == "__main__":
    main()
