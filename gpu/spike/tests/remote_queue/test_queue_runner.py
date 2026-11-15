from dataclasses import dataclass, field

from spike.remote_queue.queue_plan import GpuWaitPolicy, QueueStep
from spike.remote_queue.queue_runner import QueueDeps, run_steps

POLICY = GpuWaitPolicy(settle_seconds=10, poll_seconds=30, max_wait_seconds=60)


@dataclass
class FakeProbe:
    answers: list[list[int]] = field(default_factory=list)

    def other_pids(self) -> list[int]:
        return self.answers.pop(0) if self.answers else []


@dataclass
class Recorder:
    failing: frozenset[str] = frozenset()
    done: set[str] = field(default_factory=set)
    ran: list[str] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)
    slept: list[int] = field(default_factory=list)

    def deps(self, probe: FakeProbe | None = None) -> QueueDeps:
        return QueueDeps(probe or FakeProbe(), self.execute, self.done.__contains__, self.done.add, self.lines.append, self.slept.append, POLICY)

    def execute(self, step: QueueStep) -> bool:
        self.ran.append(step.name)
        return step.name not in self.failing


def _steps(*names: str) -> list[QueueStep]:
    return [QueueStep(name, "spike.experiments.render.run_story", ()) for name in names]


def test_runs_every_step_in_order_and_marks_it_done():
    recorder = Recorder()
    assert run_steps(_steps("a", "b"), recorder.deps()) == 0
    assert recorder.ran == ["a", "b"] and recorder.done == {"a", "b"}
    assert recorder.lines == ["START a", "DONE a", "START b", "DONE b", "ALL_DONE"]


def test_skips_steps_that_finished_in_an_earlier_run():
    recorder = Recorder(done={"a"})
    assert run_steps(_steps("a", "b"), recorder.deps()) == 0
    assert recorder.ran == ["b"] and recorder.lines[0] == "SKIP a"


def test_stops_at_the_first_failure():
    recorder = Recorder(failing=frozenset({"a"}))
    assert run_steps(_steps("a", "b"), recorder.deps()) == 2
    assert recorder.ran == ["a"] and "a" not in recorder.done
    assert recorder.lines[-2:] == ["FAIL a", "FAIL 큐를 멈췄습니다"]


def test_waits_for_another_process_then_runs():
    recorder = Recorder()
    assert run_steps(_steps("a"), recorder.deps(FakeProbe([[77], []]))) == 0
    assert recorder.slept == [10, 30] and recorder.lines[0] == "WAIT 0s 다른 GPU 프로세스 [77]"


def test_stops_without_running_when_the_gpu_stays_busy():
    recorder = Recorder()
    assert run_steps(_steps("a", "b"), recorder.deps(FakeProbe([[77]] * 10))) == 3
    assert recorder.ran == [] and recorder.slept == [10, 30, 30]
    assert recorder.lines[-1] == "STOP GPU가 비지 않아 큐를 멈췄습니다"
