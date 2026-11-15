"""원격 GPU 장비에서 이어 돌릴 실험 단계 목록과 GPU 대기 판단. 파일도 프로세스도 건드리지 않는 순수 함수."""
import re
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from typing import Literal

STEP_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")
SPIKE_MODULE = re.compile(r"^spike(\.[a-z_][a-z0-9_]*)+$")

GpuDecision = Literal["go", "wait", "stop"]


@dataclass(frozen=True)
class QueueStep:
    name: str
    module: str
    args: tuple[str, ...]


@dataclass(frozen=True)
class GpuWaitPolicy:
    """방금 끝난 단계가 NVML 목록에 잠시 남아 settle만큼 먼저 기다린다. 남의 프로세스는 max_wait까지만 기다린다."""

    settle_seconds: int = 10
    poll_seconds: int = 30
    max_wait_seconds: int = 600


def _is_text_list(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _step_problems(index: int, raw: object) -> list[str]:
    if not isinstance(raw, dict):
        return [f"{index}번 단계는 객체여야 합니다"]
    name, module, args = raw.get("name"), raw.get("module"), raw.get("args", [])
    checks = [
        (isinstance(name, str) and STEP_NAME.match(name) is not None, "name은 영문, 숫자, _.- 로만 씁니다"),
        (isinstance(module, str) and SPIKE_MODULE.match(module) is not None, "module은 spike.<모듈> 이어야 합니다"),
        (_is_text_list(args), "args는 문자열 목록이어야 합니다"),
    ]
    return [f"{index}번 단계: {message}" for ok, message in checks if not ok]


def _duplicate_names(steps: Sequence[QueueStep]) -> list[str]:
    names = [step.name for step in steps]
    return [f"이름이 두 번 나옵니다: {name}" for name in sorted({name for name in names if names.count(name) > 1})]


def parse_queue(raw: object) -> tuple[list[QueueStep], list[str]]:
    """queue.json 내용을 단계 목록으로 바꾼다. 문제가 하나라도 있으면 단계는 비우고 문제만 돌려준다."""
    entries = raw.get("steps") if isinstance(raw, dict) else None
    if not isinstance(entries, list) or not entries:
        return [], ["steps 목록이 비어 있거나 없습니다"]
    problems = [problem for index, entry in enumerate(entries) for problem in _step_problems(index, entry)]
    if problems:
        return [], problems
    steps = [QueueStep(entry["name"], entry["module"], tuple(entry.get("args", []))) for entry in entries]
    duplicates = _duplicate_names(steps)
    return ([], duplicates) if duplicates else (steps, [])


def parse_gpu_pids(nvidia_smi_output: str) -> list[int]:
    """`nvidia-smi --query-compute-apps=pid --format=csv,noheader` 출력의 PID 목록."""
    return [int(line) for line in (raw.strip() for raw in nvidia_smi_output.splitlines()) if line.isdigit()]


def other_gpu_pids(pids: Sequence[int], shared: Collection[int]) -> list[int]:
    return [pid for pid in pids if pid not in shared]


def gpu_decision(others: Sequence[int], waited_seconds: int, policy: GpuWaitPolicy) -> GpuDecision:
    if not others:
        return "go"
    return "stop" if waited_seconds >= policy.max_wait_seconds else "wait"
