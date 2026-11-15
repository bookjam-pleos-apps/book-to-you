"""compose 워크플로우 render-story·render-result·render-cleanup의 shell 단계. 결과를 JSON 한 줄로 stdout에 쓴다.

렌더는 이 프로세스 안에서 한다. 서비스의 cancel은 shell 단계의 직속 자식에게만 SIGKILL을 보내므로(포크 5bd4e1e6
utils/shell.py), 렌더를 손자 프로세스로 돌리면 cancel 뒤에도 GPU를 계속 쓴다.
렌더 중 출력은 stderr로 돌린다. stdout이 JSON 한 줄이어야 `${result.stdout as json}` 해석이 된다.
실패 처리는 spike.compose.shell_step을 따른다.

사용: python -m spike.run_render_story start --root=DIR --compose-url=URL --job-id=UUID < 묶음.tar
      python -m spike.run_render_story result --root=DIR --job-id=UUID
      python -m spike.run_render_story cleanup --root=DIR --job-id=UUID
"""
import argparse
import sys
from collections.abc import Callable, Sequence
from contextlib import redirect_stdout
from pathlib import Path
from typing import BinaryIO

from spike.render.job.render_engine_setting import load_engine_setting
from spike.render.job.render_bundle import job_dir_of, pack_result, remove_job_dir, unpack_bundle
from spike.run_render_job import failed_count, render_job_dir
from spike.compose.shell_step import run_json_step

Step = Callable[[argparse.Namespace, BinaryIO], dict]


def start(args: argparse.Namespace, stdin: BinaryIO) -> dict:
    job_dir = job_dir_of(args.root, args.job_id)
    if args.compose_url is None or not args.compose_url.startswith(("http://", "https://")):
        raise ValueError(f"start에는 이 서비스의 render-unit 주소가 필요합니다(RENDER_COMPOSE_URL): {args.compose_url!r}")
    unpack_bundle(stdin, job_dir)
    with redirect_stdout(sys.stderr):
        setting = load_engine_setting()
        rendered = render_job_dir(job_dir, setting.engine, args.compose_url, setting.batch_size)
    return {"units": len(rendered), "failed": failed_count(rendered)}


def result(args: argparse.Namespace, _stdin: BinaryIO) -> dict:
    return {"path": str(pack_result(job_dir_of(args.root, args.job_id)))}


def cleanup(args: argparse.Namespace, _stdin: BinaryIO) -> dict:
    return {"removed": remove_job_dir(job_dir_of(args.root, args.job_id))}


STEPS: dict[str, Step] = {"start": start, "result": result, "cleanup": cleanup}


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=sorted(STEPS))
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--compose-url")
    return parser.parse_args(argv)


def run_step(args: argparse.Namespace, stdin: BinaryIO) -> int:
    return run_json_step(lambda: STEPS[args.step](args, stdin))


def main() -> None:
    raise SystemExit(run_step(parse_args(), sys.stdin.buffer))


if __name__ == "__main__":
    main()
