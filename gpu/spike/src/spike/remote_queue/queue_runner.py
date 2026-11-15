"""큐의 단계를 순서대로 실행한다. 끝난 단계는 건너뛰고, 실패하거나 GPU가 비지 않으면 멈춘다.

GPU 확인, 실행, 기록은 주입받는다. 진입점은 run_queue.py다.
"""
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from functools import partial, reduce
from typing import Literal, Protocol

from spike.remote_queue.queue_plan import GpuWaitPolicy, QueueStep, gpu_decision

QueueStatus = Literal["running", "failed", "busy"]

FINAL_LINE = {"running": "ALL_DONE", "failed": "FAIL 큐를 멈췄습니다", "busy": "STOP GPU가 비지 않아 큐를 멈췄습니다"}
EXIT_CODE = {"running": 0, "failed": 2, "busy": 3}


class GpuProbe(Protocol):
    def other_pids(self) -> list[int]: ...


@dataclass(frozen=True)
class QueueDeps:
    probe: GpuProbe
    execute: Callable[[QueueStep], bool]
    is_done: Callable[[str], bool]
    mark_done: Callable[[str], None]
    report: Callable[[str], None]
    sleep: Callable[[int], None]
    policy: GpuWaitPolicy = GpuWaitPolicy()


def _wait_for_gpu(deps: QueueDeps, waited: int = 0) -> bool:
    """대기 횟수는 max_wait / poll로 제한된다."""
    others = deps.probe.other_pids()
    decision = gpu_decision(others, waited, deps.policy)
    if decision != "wait":
        return decision == "go"
    deps.report(f"WAIT {waited}s 다른 GPU 프로세스 {others}")
    deps.sleep(deps.policy.poll_seconds)
    return _wait_for_gpu(deps, waited + deps.policy.poll_seconds)


def _run_step(deps: QueueDeps, step: QueueStep) -> QueueStatus:
    deps.sleep(deps.policy.settle_seconds)
    if not _wait_for_gpu(deps):
        return "busy"
    deps.report(f"START {step.name}")
    if not deps.execute(step):
        deps.report(f"FAIL {step.name}")
        return "failed"
    deps.mark_done(step.name)
    deps.report(f"DONE {step.name}")
    return "running"


def _advance(deps: QueueDeps, status: QueueStatus, step: QueueStep) -> QueueStatus:
    if status != "running":
        return status
    if deps.is_done(step.name):
        deps.report(f"SKIP {step.name}")
        return status
    return _run_step(deps, step)


def run_steps(steps: Sequence[QueueStep], deps: QueueDeps) -> int:
    """종료 코드: 0 모두 끝남, 2 단계 실패, 3 GPU가 비지 않음."""
    status = reduce(partial(_advance, deps), steps, "running")
    deps.report(FINAL_LINE[status])
    return EXIT_CODE[status]
