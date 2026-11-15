import re
import subprocess
import sys
from pathlib import Path

import pytest

from spike.clone.engine.engine_ids import BATCH_ENGINE_ID, COMPOSE_ENGINE_ID, DIRECT_ENGINE_ID, WORKFLOW_ENGINE_ID
from spike.run_render_job import parse_args

URL = "http://127.0.0.1:18096/api/workflows/runs"
RENDER_BATCH = Path(__file__).parents[4] / "apps" / "api" / "scripts" / "render-batch.sh"


def test_product_render_uses_the_compose_engine_by_default():
    args = parse_args(["--job", "job", "--compose-url", URL])

    assert (args.engine, args.compose_url) == (COMPOSE_ENGINE_ID, URL)


def test_direct_engine_stays_as_the_fallback():
    assert parse_args(["--job", "job", "--engine", DIRECT_ENGINE_ID]).engine == DIRECT_ENGINE_ID


@pytest.mark.parametrize(
    "argv",
    [
        ["--engine", "qwen3-large", "--compose-url", URL],
        ["--engine", DIRECT_ENGINE_ID, "--compose-url", URL],
        [],
    ],
)
def test_ambiguous_engine_choices_are_refused_before_rendering(argv: list[str]):
    with pytest.raises(SystemExit):
        parse_args(["--job", "job", *argv])


def test_cleanup_needs_no_service_url():
    assert parse_args(["--job", "job", "--cleanup"]).cleanup


def test_compose_render_runs_without_torch():
    """서비스 엔진(compose, workflow)과 워크플로우의 단계 CLI는 --extra gpu 없이 돈다. 다른 테스트의 import와 섞이지 않게 새 프로세스에서 확인한다."""
    probe = (
        "import sys; from spike.compose.engine_backends import load_backend; "
        f"load_backend({COMPOSE_ENGINE_ID!r}, {URL!r}); "
        "import spike.run_render_job; import spike.compose.workflow_render; import spike.run_render_step; "
        "sys.exit('torch' in sys.modules)"
    )

    assert subprocess.run([sys.executable, "-c", probe], check=False).returncode == 0


def _shell_constant(name: str) -> str:
    match = re.search(rf'^{name}="([^"]+)"$', RENDER_BATCH.read_text(encoding="utf-8"), re.MULTILINE)
    assert match, f"{name}가 render-batch.sh에 없습니다"
    return match.group(1)


def test_batch_script_names_the_same_engines():
    shell = (_shell_constant("DIRECT_ENGINE"), _shell_constant("COMPOSE_ENGINE"), _shell_constant("WORKFLOW_ENGINE"), _shell_constant("BATCH_ENGINE"))

    assert shell == (DIRECT_ENGINE_ID, COMPOSE_ENGINE_ID, WORKFLOW_ENGINE_ID, BATCH_ENGINE_ID)


def test_the_workflow_engine_also_needs_the_service_url():
    assert parse_args(["--job", "job", "--engine", WORKFLOW_ENGINE_ID, "--compose-url", URL]).engine == WORKFLOW_ENGINE_ID
    with pytest.raises(SystemExit):
        parse_args(["--job", "job", "--engine", WORKFLOW_ENGINE_ID])


def test_batch_script_defaults_to_the_compose_engine_like_the_cli():
    """CLI의 기본값은 test_product_render_uses_the_compose_engine_by_default가 고정한다."""
    assert re.search(r'^ENGINE="\$COMPOSE_ENGINE" ', RENDER_BATCH.read_text(encoding="utf-8"), re.MULTILINE)


def test_the_batch_engine_needs_the_service_url_and_takes_a_batch_size():
    args = parse_args(["--job", "job", "--engine", BATCH_ENGINE_ID, "--compose-url", URL, "--batch-size", "4"])
    assert (args.engine, args.batch_size) == (BATCH_ENGINE_ID, 4)
    with pytest.raises(SystemExit):
        parse_args(["--job", "job", "--engine", BATCH_ENGINE_ID])
