"""spike 패키지는 한 방향으로만 기댄다. 새 모듈을 넣을 때 순환이 생기지 않게 고정한다."""

import ast
from pathlib import Path

SPIKE = Path(__file__).parents[1] / "src" / "spike"

# 앞에 있는 패키지는 뒤에 있는 패키지를 import하지 않는다. 진입점(run_*, experiments/)은 맨 위라 무엇이든 쓸 수 있다.
ORDER = ("sound", "clone", "story", "render", "compose", "listening", "evaluation", "cover", "remote_queue")
ENTRY = "entry"
EXPERIMENTS = "experiments"
RANK = {name: index for index, name in enumerate((*ORDER, ENTRY))}


def _package_of(path: Path) -> str:
    top = path.relative_to(SPIKE).parts[0]
    return ENTRY if path.parent == SPIKE or top == EXPERIMENTS else top


def _imported_packages(path: Path) -> set[str]:
    modules = {node.module for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))) if isinstance(node, ast.ImportFrom) and node.module}
    spike_modules = {tuple(module.split(".")) for module in modules if module.split(".")[0] == "spike"}
    return {parts[1] if parts[1] in ORDER else ENTRY for parts in spike_modules if len(parts) > 1}


def _upward_imports() -> list[str]:
    sources = [path for path in SPIKE.rglob("*.py") if path.name != "__init__.py"]
    return sorted(
        f"{path.relative_to(SPIKE)} -> {target}"
        for path in sources
        for target in _imported_packages(path)
        if RANK[target] > RANK[_package_of(path)]
    )


def test_packages_only_depend_downward() -> None:
    assert _upward_imports() == []


def _imports_experiments(path: Path) -> bool:
    return any(isinstance(node, ast.ImportFrom) and (node.module or "").startswith(f"spike.{EXPERIMENTS}") for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))))


def test_only_experiments_import_experiments() -> None:
    sources = [path for path in SPIKE.rglob("*.py") if path.relative_to(SPIKE).parts[0] != EXPERIMENTS]
    assert sorted(str(path.relative_to(SPIKE)) for path in sources if _imports_experiments(path)) == []


def test_every_library_module_lives_in_a_package() -> None:
    loose = sorted(path.name for path in SPIKE.glob("*.py") if not path.name.startswith(("run_", "__")) and path.name != "guyeon_tools.py")
    assert loose == []
