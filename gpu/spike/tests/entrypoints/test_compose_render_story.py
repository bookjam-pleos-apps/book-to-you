"""render-story·render-result·render-cleanup의 연결을 파싱 결과로 고정한다. 인증 없는 서비스라 요청이 정하는 값을 좁힌다."""
from pathlib import Path

import pytest
from mindor.dsl.loader import load_compose_config
from mindor.dsl.schema.compose import ComposeConfig

from spike.run_render_story import STEPS

VOICE_CLONE_DIR = Path(__file__).parents[3] / "compose" / "voice-clone"
# 설정을 읽을 때 `${env.X | 기본값}`이 풀린다. 테스트 환경에는 값이 없어 기본값이 남는다.
UNSET_PYTHON = "spike-python-not-set"
UNSET_ROOT = "--root=render-jobs-dir-not-set"
UNSET_URL = "--compose-url=render-compose-url-not-set"
STEP_COMPONENTS = {"start": "render-story", "result": "render-pack", "cleanup": "render-cleanup"}


@pytest.fixture(scope="module")
def config() -> ComposeConfig:
    return load_compose_config(str(VOICE_CLONE_DIR), [VOICE_CLONE_DIR / "model-compose.yml"], {})


def _component(config: ComposeConfig, component_id: str):
    return next(item for item in config.components if item.id == component_id)


def _workflow(config: ComposeConfig, workflow_id: str):
    return next(item for item in config.workflows if item.id == workflow_id)


def test_every_step_has_a_component(config: ComposeConfig):
    assert sorted(STEP_COMPONENTS) == sorted(STEPS)
    assert {_component(config, component_id).type.value for component_id in STEP_COMPONENTS.values()} == {"shell"}


@pytest.mark.parametrize(("step", "component_id"), STEP_COMPONENTS.items())
def test_a_request_decides_only_the_job_id(config: ComposeConfig, step: str, component_id: str):
    command = _component(config, component_id).actions[0].command
    from_input = [arg for arg in command if "${input." in arg]

    assert command[:4] == [UNSET_PYTHON, "-m", "spike.run_render_story", step]
    assert from_input == ["--job-id=${input.job_id}"]
    assert UNSET_ROOT in command


def test_the_render_runs_as_the_direct_child_with_a_backstop_timeout(config: ComposeConfig):
    action = _component(config, "render-story").actions[0]

    assert action.command[0] != "sh"
    assert action.stdin == "${input.bundle as file}"
    assert action.timeout == "35m"
    assert UNSET_URL in action.command


def test_the_result_is_a_file_read_from_the_packed_path(config: ComposeConfig):
    assert _workflow(config, "render-result").output == "${jobs.pack.output.path as file;path}"
