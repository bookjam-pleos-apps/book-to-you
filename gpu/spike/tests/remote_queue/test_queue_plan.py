import pytest

from spike.remote_queue.queue_plan import GpuWaitPolicy, QueueStep, gpu_decision, other_gpu_pids, parse_gpu_pids, parse_queue


def _step(name="fisherman_1234", module="spike.experiments.render.run_story", args=("--seed", "1234")):
    return {"name": name, "module": module, "args": list(args)}


def test_parses_steps_in_order():
    steps, problems = parse_queue({"steps": [_step("a"), _step("b", args=())]})
    assert problems == []
    assert steps == [QueueStep("a", "spike.experiments.render.run_story", ("--seed", "1234")), QueueStep("b", "spike.experiments.render.run_story", ())]


def test_args_default_to_empty():
    steps, _ = parse_queue({"steps": [{"name": "a", "module": "spike.experiments.measure.run_story_quality"}]})
    assert steps[0].args == ()


@pytest.mark.parametrize(
    "raw",
    [
        None,
        {"steps": []},
        {"steps": ["a"]},
        {"steps": [_step(name="../escape")]},
        {"steps": [_step(module="os")]},
        {"steps": [_step(module="spike.experiments.render.run_story; rm")]},
        {"steps": [{"name": "a", "module": "spike.experiments.render.run_story", "args": [1]}]},
        {"steps": [_step("a"), _step("a")]},
    ],
)
def test_rejects_a_queue_it_cannot_run_safely(raw):
    steps, problems = parse_queue(raw)
    assert steps == [] and problems


def test_reads_pids_and_ignores_blank_lines():
    assert parse_gpu_pids("1234\n\n 5678 \n") == [1234, 5678]
    assert parse_gpu_pids("") == []


def test_shared_pids_are_not_others():
    assert other_gpu_pids([1, 2, 3], frozenset({2})) == [1, 3]


@pytest.mark.parametrize(
    ("others", "waited", "decision"),
    [([], 0, "go"), ([], 900, "go"), ([9], 0, "wait"), ([9], 570, "wait"), ([9], 600, "stop")],
)
def test_gpu_decision(others, waited, decision):
    assert gpu_decision(others, waited, GpuWaitPolicy(max_wait_seconds=600)) == decision
