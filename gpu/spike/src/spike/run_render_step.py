"""compose 워크플로우 render-attempt의 shell 단계. 단계마다 결과를 JSON 한 줄로 stdout에 쓴다.

model-compose shell 컴포넌트는 실패해도 예외를 내지 않는다(exit_code만 남김). 그래서 실패하면 stdout을 비운 채
0이 아닌 코드로 끝낸다. 다음 단계의 `${result.stdout as json}` 해석이 실패해 워크플로우가 그 자리에서 멈춘다.
작업 폴더(job.json)가 없으면 아무것도 만들지 않는다. 렌더가 끝나 지운 폴더에 부모 음성을 다시 쓰지 않기 위해서다.
단계끼리 상태를 나누지 않도록 단계마다 job.json을 다시 읽는다(시도당 몇 ms).

사용: python -m spike.run_render_step spec --job=DIR --unit=3 --attempt=0
      python -m spike.run_render_step save --job=DIR --unit=3 --attempt=0 < 클론.wav
      python -m spike.run_render_step cut --job=DIR --unit=3 --attempt=0 --texts='["그래"]'
      python -m spike.run_render_step segments --job=DIR --unit=3 --attempt=0 --vad='[{"start_time":0.1,"end_time":2.3}]'
      python -m spike.run_render_step qc --job=DIR --unit=3 --attempt=0 --texts='["받아쓰기"]'
"""

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from spike.compose.shell_step import run_json_step
from spike.compose.unit_steps import STEPS, ReadStdin


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=sorted(STEPS))
    parser.add_argument("--job", type=Path, required=True)
    parser.add_argument("--unit", type=int, required=True)
    parser.add_argument("--attempt", type=int, required=True)
    parser.add_argument("--vad", default="[]")
    parser.add_argument("--texts", default="[]")
    return parser.parse_args(argv)


def run_step(args: argparse.Namespace, read_stdin: ReadStdin) -> int:
    return run_json_step(lambda: STEPS[args.step](args, read_stdin))


def main() -> None:
    raise SystemExit(run_step(parse_args(), sys.stdin.buffer.read))


if __name__ == "__main__":
    main()
