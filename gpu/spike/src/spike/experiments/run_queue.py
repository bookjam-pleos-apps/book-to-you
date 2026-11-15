"""GPU 장비에서 실험 큐를 이어 돌린다. 맥과의 연결이 끊겨도 돌도록 nohup으로 띄운다.

사용(GPU 장비의 gpu/spike에서):
  nohup uv run --frozen --extra gpu python -m spike.experiments.run_queue --queue outputs/<exp>/queue.json --gpu 0 \
    [--share-with <pid,...>] > outputs/<exp>/queue.out 2>&1 &

진행은 outputs/<exp>/progress.log, 단계별 출력은 outputs/<exp>/<name>.log에 남는다.
도는 동안 큐 프로세스의 PID를 outputs/<exp>/queue.pid에 둔다. 공유 장비에서 중지 요청을 받으면 이 PID로 우리 것만 끝낸다.
끝난 단계는 outputs/<exp>/.done/<name> 표시로 건너뛰므로 다시 띄우면 이어서 돈다.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from spike.clone.cli_output import abort_if
from spike.remote_queue.queue_plan import QueueStep, other_gpu_pids, parse_gpu_pids, parse_queue
from spike.remote_queue.queue_runner import QueueDeps, run_steps


@dataclass(frozen=True)
class NvidiaSmiProbe:
    gpu: int
    shared: frozenset[int]

    def other_pids(self) -> list[int]:
        query = ["nvidia-smi", "-i", str(self.gpu), "--query-compute-apps=pid", "--format=csv,noheader"]
        result = subprocess.run(query, capture_output=True, text=True)
        if result.returncode != 0:
            raise SystemExit(f"nvidia-smi 실패: {result.stderr.strip()}")
        return other_gpu_pids(parse_gpu_pids(result.stdout), self.shared)


@dataclass(frozen=True)
class QueueFolder:
    root: Path

    def is_done(self, name: str) -> bool:
        return (self.root / ".done" / name).exists()

    def mark_done(self, name: str) -> None:
        (self.root / ".done").mkdir(exist_ok=True)
        (self.root / ".done" / name).touch()

    def record_pid(self, pid: int) -> None:
        (self.root / "queue.pid").write_text(str(pid), encoding="utf-8")

    def clear_pid(self) -> None:
        (self.root / "queue.pid").unlink(missing_ok=True)

    def report(self, line: str) -> None:
        stamped = f"{time.strftime('%H:%M:%S')} {line}"
        print(stamped, flush=True)
        with (self.root / "progress.log").open("a", encoding="utf-8") as log:
            log.write(stamped + "\n")


def step_runner(root: Path, gpu: int) -> Callable[[QueueStep], bool]:
    """nvidia-smi와 같은 번호를 쓰도록 PCI 순서로 GPU를 고른다. 단계마다 새 프로세스라 GPU 메모리가 풀린다."""
    env = {**os.environ, "CUDA_DEVICE_ORDER": "PCI_BUS_ID", "CUDA_VISIBLE_DEVICES": str(gpu)}

    def execute(step: QueueStep) -> bool:
        with (root / f"{step.name}.log").open("w", encoding="utf-8") as log:
            command = [sys.executable, "-m", step.module, *step.args]
            return subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, env=env).returncode == 0

    return execute


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="실험 큐를 순서대로 돈다")
    parser.add_argument("--queue", type=Path, required=True)
    parser.add_argument("--gpu", type=int, default=0)
    parser.add_argument("--share-with", default="", help="함께 써도 된다고 사람이 확인한 PID, 쉼표로 구분")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    steps, problems = parse_queue(json.loads(args.queue.read_text(encoding="utf-8")))
    abort_if(problems, f"큐를 읽을 수 없습니다: {args.queue}")
    shared = frozenset(int(pid) for pid in args.share_with.split(",") if pid.strip())
    folder = QueueFolder(args.queue.parent)
    deps = QueueDeps(
        NvidiaSmiProbe(args.gpu, shared), step_runner(folder.root, args.gpu), folder.is_done, folder.mark_done, folder.report, time.sleep
    )
    folder.record_pid(os.getpid())
    try:
        code = run_steps(steps, deps)
    finally:
        folder.clear_pid()
    raise SystemExit(code)


if __name__ == "__main__":
    main()
