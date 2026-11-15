"""validate는 오타 필드를 통과시킬 수 있어, 라벨링 서비스의 값을 파싱 결과와 lock에서 직접 확인한다. Nimble 자체의 스키마 규칙은 DGX 첫 호출 전까지 검증되지 않는다."""
import platform
import sys
import tomllib
from collections.abc import Iterable
from pathlib import Path

import pytest
from mindor.core.compose.validator import ComposeValidator
from mindor.core.component.services.model.tasks.typed_decision.custom import nimble as nimble_driver
from mindor.dsl.loader import load_compose_config
from mindor.dsl.schema.compose import ComposeConfig
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

COMPOSE_DIR = Path(__file__).parents[3] / "compose"
SERVICE_DIR = COMPOSE_DIR / "story-labeling"
SERVICE_PORT = 18092


@pytest.fixture(scope="module")
def service() -> ComposeConfig:
    return load_compose_config(str(SERVICE_DIR), [SERVICE_DIR / "model-compose.yml"], {})


def _project(folder: Path) -> dict:
    return tomllib.loads((folder / "pyproject.toml").read_text(encoding="utf-8"))["project"]


def _by_name(requirements: Iterable[str]) -> dict[str, Requirement]:
    parsed = map(Requirement, requirements)
    return {canonicalize_name(requirement.name): requirement for requirement in parsed}


def _driver_requirements(monkeypatch: pytest.MonkeyPatch) -> dict[str, Requirement]:
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setattr(platform, "machine", lambda: "aarch64")
    monkeypatch.setattr(nimble_driver, "torch_requirements", lambda *specs: list(specs))
    return _by_name(nimble_driver.NimbleTypedDecisionTaskDriver._get_setup_requirements(None))


def test_service_passes_validation(service: ComposeConfig):
    assert ComposeValidator(service).validate() == []


def test_only_the_style_tagging_workflow_is_exposed(service: ComposeConfig):
    assert [workflow.id for workflow in service.workflows] == ["style-tagging"]


def test_workflow_returns_the_job_output(service: ComposeConfig):
    assert service.workflows[0].jobs[0].output == "${output as json}"


def test_service_listens_only_on_its_own_loopback_port(service: ComposeConfig):
    adapter = service.controller.adapters[0]
    assert (adapter.host, adapter.port, adapter.base_path) == ("127.0.0.1", SERVICE_PORT, "/api")
    assert service.controller.max_concurrent_count == 1
    assert service.controller.webui is None


def test_scorer_keeps_lock_and_model_revisions_fixed(service: ComposeConfig):
    component = service.components[0]
    assert (component.family, component.max_seq_length, component.max_concurrent_count) == ("nimble", 4096, 1)
    assert component.model.revision and component.base_model.revision
    assert component.runtime.type == "native"
    assert component.actions[0].return_probabilities is True


def test_lock_covers_what_the_driver_would_install(monkeypatch: pytest.MonkeyPatch):
    drivers = _driver_requirements(monkeypatch)
    pinned = _by_name(_project(SERVICE_DIR)["dependencies"])
    assert drivers.keys() <= pinned.keys()
    exact = [name for name, requirement in drivers.items() if str(requirement.specifier).startswith("==")]
    assert exact
    assert all(pinned[name].specifier == drivers[name].specifier for name in exact)


def test_each_machine_gets_a_torch_wheel_its_driver_accepts():
    lock = tomllib.loads((SERVICE_DIR / "uv.lock").read_text(encoding="utf-8"))
    versions = {package["version"] for package in lock["package"] if package["name"] == "torch"}
    assert versions == {"2.14.1+cu130", "2.13.0+cu126"}


def test_services_share_one_fork_commit():
    urls = [
        next(dep for dep in _project(folder)["dependencies"] if dep.startswith("model-compose"))
        for folder in (SERVICE_DIR, COMPOSE_DIR / "voice-clone")
    ]
    assert urls[0] == urls[1]
