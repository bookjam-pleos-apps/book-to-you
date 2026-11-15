"""render-unit·render-attempt 워크플로우의 연결을 파싱 결과로 고정한다. validate는 모르는 필드를 통과시키므로 값을 직접 본다."""
import asyncio
from pathlib import Path

import pytest
from mindor.core.compose.validator import ComposeValidator
from mindor.core.foundation.variable.renderer import VariableRenderer
from mindor.dsl.loader import load_compose_config
from mindor.dsl.schema.compose import ComposeConfig

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS
from spike.run_render_step import STEPS

VOICE_CLONE_DIR = Path(__file__).parents[3] / "compose" / "voice-clone"
STEP_COMPONENTS = {"spec": "render-spec", "save": "render-save", "cut": "render-cut", "segments": "render-segments", "qc": "render-qc"}
STEP_ARGS = ["--job=${input.job_dir}", "--unit=${input.unit_index}", "--attempt=${input.attempt}"]
UNSET_PYTHON = "spike-python-not-set"


@pytest.fixture(scope="module")
def config() -> ComposeConfig:
    return load_compose_config(str(VOICE_CLONE_DIR), [VOICE_CLONE_DIR / "model-compose.yml"], {})


def _workflow(config: ComposeConfig, workflow_id: str):
    return next(item for item in config.workflows if item.id == workflow_id)


def _component(config: ComposeConfig, component_id: str):
    return next(item for item in config.components if item.id == component_id)


def _jobs(config: ComposeConfig, workflow_id: str) -> dict:
    return {job.id: job for job in _workflow(config, workflow_id).jobs}


def test_render_workflows_pass_validation(config: ComposeConfig):
    assert ComposeValidator(config).validate() == []


def test_a_unit_retries_up_to_the_python_attempt_limit_and_stops_when_qc_says_done(config: ComposeConfig):
    loop = _jobs(config, "render-unit")["attempts"]

    assert loop.max_iteration_count == MAX_ATTEMPTS
    assert (loop.until.input, loop.until.operator.value, loop.until.value) == ("${output.done}", "eq", True)
    assert loop.do.component == "render-attempt-flow"
    assert loop.do.input["attempt"] == "${iteration}"
    assert _component(config, "render-attempt-flow").actions[0].workflow == "render-attempt"


def test_an_attempt_clones_saves_and_hands_the_take_on(config: ComposeConfig):
    jobs = _jobs(config, "render-attempt")

    assert [(job_id, job.depends_on) for job_id, job in jobs.items()] == [("spec", []), ("clone", ["spec"]), ("save", ["clone"]), ("take", ["save"])]
    assert jobs["take"].component == "render-take-flow"
    assert jobs["take"].input["tail_clips"] == "${jobs.save.output.tail_clips}"
    assert _component(config, "render-take-flow").actions[0].workflow == "render-take"


def test_a_take_runs_its_steps_in_order(config: ComposeConfig):
    jobs = _jobs(config, "render-take")

    assert [(job_id, job.depends_on) for job_id, job in jobs.items()] == [
        ("tail", []), ("cut", ["tail"]), ("detect", ["cut"]), ("segments", ["detect"]), ("transcribe", ["segments"]), ("qc", ["transcribe"]),
    ]
    assert jobs["detect"].input["audio_path"] == "${jobs.cut.output.audio_path}"


def test_an_attempt_reuses_the_measured_clone_vad_and_whisper_components(config: ComposeConfig):
    jobs, take = _jobs(config, "render-attempt"), _jobs(config, "render-take")

    assert (jobs["clone"].component, take["detect"].component, take["transcribe"].do.component) == ("qwen-clone", "vad", "whisper")
    assert jobs["clone"].input["seed"] == "${jobs.spec.output.seed}"
    assert jobs["save"].input["audio"] == "${jobs.clone.output}"


def test_word_tail_clips_are_transcribed_before_the_cut(config: ComposeConfig):
    jobs = _jobs(config, "render-take")

    assert (jobs["tail"].input, jobs["tail"].do.component) == ("${input.tail_clips}", "whisper")
    assert jobs["cut"].input["texts"] == "${jobs.tail.output}"


@pytest.mark.parametrize(("step", "component_id"), STEP_COMPONENTS.items())
def test_each_step_component_calls_the_matching_cli_step(config: ComposeConfig, step: str, component_id: str):
    action = _component(config, component_id).actions[0]

    assert step in STEPS
    assert action.command[:4] == [UNSET_PYTHON, "-m", "spike.run_render_step", step]
    assert action.command[4:7] == STEP_ARGS
    assert action.output == "${result.stdout as json}"


def test_lists_reach_the_cli_as_json_text(config: ComposeConfig):
    """리스트를 그대로 넣으면 shell이 요소마다 명령을 돌린다."""
    assert _component(config, "render-segments").actions[0].command[-1] == "--vad=${input.vad as text}"
    assert _component(config, "render-qc").actions[0].command[-1] == "--texts=${input.texts as text}"
    assert _component(config, "render-cut").actions[0].command[-1] == "--texts=${input.texts as text}"
    assert _component(config, "render-save").actions[0].stdin == "${input.audio}"


def test_the_interpreter_comes_from_the_service_environment_not_the_request():
    """인증 없는 서비스라 실행 파일을 요청 입력으로 받으면 같은 장비의 누구든 아무 프로그램이나 실행시킬 수 있다."""
    configured = load_compose_config(str(VOICE_CLONE_DIR), [VOICE_CLONE_DIR / "model-compose.yml"], {"SPIKE_PYTHON": "/srv/spike/.venv/bin/python"})

    assert all(_component(configured, component_id).actions[0].command[0] == "/srv/spike/.venv/bin/python" for component_id in STEP_COMPONENTS.values())
    inputs = [str(job.input) for workflow_id in ("render-unit", "render-attempt", "render-take") for job in _workflow(configured, workflow_id).jobs]
    loop_do_input = str(_jobs(configured, "render-unit")["attempts"].do.input)
    assert all("python" not in text for text in [*inputs, loop_do_input])


def test_a_batch_clones_once_and_saves_each_unit_its_own_audio(config: ComposeConfig):
    jobs = _jobs(config, "render-batch")

    assert (jobs["clone"].component, jobs["clone"].action) == ("qwen-clone", "clone-batch")
    assert jobs["save"].input == {"&": {"unit": "${jobs.spec.output.units}", "audio": "${jobs.clone.output as audio[]/wav}"}}
    assert jobs["save"].do.component == "render-save"


def test_a_batch_transcribes_each_stage_in_one_whisper_call(config: ComposeConfig):
    jobs = _jobs(config, "render-batch")

    assert [(job_id, job.depends_on) for job_id, job in jobs.items()] == [
        ("spec", []), ("clone", ["spec"]), ("save", ["clone"]), ("tails", ["save"]), ("tail-texts", ["tails"]), ("cut", ["tail-texts"]),
        ("detect", ["cut"]), ("segments", ["detect"]), ("transcribe", ["segments"]), ("qc", ["transcribe"]),
    ]
    assert [jobs[name].input["step"] for name in ("tails", "cut", "segments", "qc")] == ["tails", "cut", "segments", "qc"]
    assert {jobs[name].component for name in ("tails", "cut", "segments", "qc")} == {"render-batch-step"}
    assert (jobs["tail-texts"].component, jobs["tail-texts"].input["audio_path"]) == ("whisper", "${jobs.tails.output.paths}")
    assert (jobs["transcribe"].component, jobs["transcribe"].input["audio_path"]) == ("whisper", "${jobs.segments.output.paths}")
    assert jobs["detect"].input == "${jobs.cut.output.long}" and jobs["detect"].do.component == "vad"
    assert jobs["tail-texts"].input["batch_size"] == jobs["transcribe"].input["batch_size"] == 1


@pytest.mark.parametrize(("given", "rendered"), [({}, 1), ({"batch_size": 8}, 8)])
def test_whisper_batch_size_is_an_integer_even_when_the_caller_gives_none(config: ComposeConfig, given: dict, rendered: int):
    """`| 1`만 쓰면 문자열 "1"로 풀려 check-clip 같은 단건 호출이 크기 비교에서 실패했다(DGX)."""
    expression = _component(config, "whisper").actions[0].batch_size

    async def source(key, *_args, **_kwargs):
        return {"input": given}.get(key)

    assert asyncio.run(VariableRenderer(source).render(expression)) == rendered


def test_the_batch_steps_call_the_batch_cli_with_the_step_from_the_workflow(config: ComposeConfig):
    command = _component(config, "render-batch-step").actions[0].command

    assert command[1:4] == ["-m", "spike.run_render_batch_step", "${input.step}"]
    assert command[-2:] == ["--texts=${input.texts as text | []}", "--vad=${input.vad as text | []}"]


def test_the_batch_clone_keeps_the_single_clone_settings(config: ComposeConfig):
    single, batch = (next(action for action in _component(config, "qwen-clone").actions if action.id == name) for name in ("clone", "clone-batch"))

    assert (batch.method, batch.non_streaming_mode, batch.language) == (single.method, single.non_streaming_mode, single.language)
    assert (batch.text, batch.batch_size) == ("${input.texts}", "${input.batch_size}")


def test_the_batch_spec_calls_the_batch_cli(config: ComposeConfig):
    command = _component(config, "render-batch-spec").actions[0].command

    assert command[1:4] == ["-m", "spike.run_render_batch_step", "spec"]
    assert command[4:] == ["--job=${input.job_dir}", "--units=${input.unit_indices as text}", "--attempt=${input.attempt}"]


def test_voice_embed_runs_the_spike_cli_in_its_own_environment(config: ComposeConfig):
    command = _component(config, "voice-embed").actions[0].command

    assert command[0] == "spike-voice-python-not-set"
    assert command[1:] == ["-m", "spike.run_voice_embed", "--paths=${input.paths as text}", "--device=cpu"]


def test_both_post_processing_paths_judge_with_the_same_unit_steps(config: ComposeConfig):
    """render-take(단위별)와 render-batch(배치 단계)는 같은 단위 판단을 부른다. 한쪽만 바뀌면 엔진에 따라 합격 기준이 갈린다."""
    single = {_component(config, f"render-{step}").actions[0].command[3] for step in ("cut", "segments", "qc")}
    batched = {_jobs(config, "render-batch")[step].input["step"] for step in ("cut", "segments", "qc")}

    assert single == batched == {"cut", "segments", "qc"}
