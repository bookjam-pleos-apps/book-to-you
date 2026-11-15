"""코드 규칙 시험. 일괄 수정이 조용히 빠지면 미사용 import로 드러난다."""

import ast
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
REPO = ROOT.parents[1]
FILES = [*ROOT.glob("scripts/*.py"), *ROOT.glob("tests/*.py")]
DOCS = [ROOT / "README.md", ROOT / "scripts" / "README.md"]
MAX_FUNCTION_LINES = 25
MAX_FILE_LINES = 200


def _functions(tree: ast.AST) -> list[ast.FunctionDef]:
    return [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]


def _imported_names(tree: ast.AST) -> set[str]:
    imports = [node for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))]
    return {(alias.asname or alias.name).split(".")[0] for node in imports for alias in node.names}


def _used_names(tree: ast.AST) -> set[str]:
    names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    return names | {node.value.id for node in ast.walk(tree) if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)}


class Rules(unittest.TestCase):
    def test_no_unused_imports(self) -> None:
        for path in FILES:
            tree = ast.parse(path.read_text(encoding="utf-8"))
            self.assertEqual(_imported_names(tree) - _used_names(tree) - {"annotations"}, set(), path.name)

    def test_size_limits(self) -> None:
        for path in FILES:
            text = path.read_text(encoding="utf-8")
            self.assertLessEqual(text.count("\n"), MAX_FILE_LINES, path.name)
            long_functions = [node.name for node in _functions(ast.parse(text)) if node.end_lineno - node.lineno + 1 > MAX_FUNCTION_LINES]
            self.assertEqual(long_functions, [], path.name)

    def test_no_comprehension_only_for_its_side_effect(self) -> None:
        for path in FILES:
            comprehensions = [node for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))) if isinstance(node, ast.ListComp)]
            side_effects = [
                ast.unparse(node)
                for node in comprehensions
                if isinstance(node.elt, ast.Call) and ast.unparse(node.elt.func).endswith(".add")
            ]
            self.assertEqual(side_effects, [], path.name)


class Docs(unittest.TestCase):
    def test_commands_use_the_tested_python(self) -> None:
        """시스템 python3는 3.9일 수 있고 스크립트는 3.10 문법을 쓴다."""
        for path in DOCS:
            self.assertNotIn("python3 ", path.read_text(encoding="utf-8"), path.name)

    def test_documented_scripts_exist(self) -> None:
        for path in DOCS:
            for name in re.findall(r"scripts/(\w+\.py)", path.read_text(encoding="utf-8")):
                self.assertTrue((ROOT / "scripts" / name).exists(), f"{path.name}: {name}")

    def test_docs_do_not_depend_on_personal_memory(self) -> None:
        for path in DOCS:
            self.assertNotIn("project_clone_quality_progress", path.read_text(encoding="utf-8"), path.name)


class Repo(unittest.TestCase):
    def test_repo_itself_ignores_local_files(self) -> None:
        """개인 전역 설정이 없는 PC에서도 제외되어야 한다."""
        for name in (".claude/settings.local.json", "content/tools/scripts/__pycache__/a.pyc"):
            result = subprocess.run(["git", "-c", "core.excludesFile=/dev/null", "check-ignore", "-q", name], cwd=REPO)
            self.assertEqual(result.returncode, 0, name)


if __name__ == "__main__":
    unittest.main()
