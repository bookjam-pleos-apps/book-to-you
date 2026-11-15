"""cover-focus 서비스 정의를 파싱 결과로 확인한다(validate는 오타 필드를 통과시킬 수 있다)."""
from pathlib import Path

import pytest
from mindor.core.compose.validator import ComposeValidator
from mindor.dsl.loader import load_compose_config
from mindor.dsl.schema.compose import ComposeConfig

from spike.run_cover_focus import DEFAULT_URL, VLM_MODEL, VLM_REVISION

COVER_FOCUS_DIR = Path(__file__).parents[3] / "compose" / "cover-focus"


@pytest.fixture(scope="module")
def cover_focus() -> ComposeConfig:
    return load_compose_config(str(COVER_FOCUS_DIR), [COVER_FOCUS_DIR / "model-compose.yml"], {})


def test_cover_focus_passes_validation(cover_focus: ComposeConfig):
    assert ComposeValidator(cover_focus).validate() == []


def test_runner_calls_the_loopback_service(cover_focus: ComposeConfig):
    adapter = cover_focus.controller.adapters[0]

    assert adapter.host == "127.0.0.1"
    assert DEFAULT_URL == f"http://{adapter.host}:{adapter.port}{adapter.base_path}/workflows/runs"


def test_runner_workflows_exist(cover_focus: ComposeConfig):
    assert {"locate-subjects", "preview-crop", "mark-subjects"} <= {workflow.id for workflow in cover_focus.workflows}


def test_vlm_matches_the_runner_and_runs_whole_on_one_device(cover_focus: ComposeConfig):
    vlm = next(component for component in cover_focus.components if component.id == "subject-locator")

    assert vlm.model.repository == VLM_MODEL
    assert vlm.model.revision == VLM_REVISION
    assert (vlm.device_mode.value, vlm.device, vlm.precision.value) == ("single", "mps", "bfloat16")
