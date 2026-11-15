"""판정표 답 파일. 판정표의 모든 행에 사람의 답이 있어야 확정한다."""

from pathlib import Path

from guyeon_common import read_json


def _base_key(row: dict) -> str:
    return f"{row['kind']}:{row['from']}-{row['to']}"


def row_keys(rows: list[dict]) -> list[str]:
    """같은 kind와 범위의 행(한 문장의 검수 요청 둘)이 답 하나로 함께 통과하지 않게, 판정표 순서대로 두 번째부터 `#2`를 붙인다."""
    bases = [_base_key(row) for row in rows]
    return [base if bases[:i].count(base) == 0 else f"{base}#{bases[:i].count(base) + 1}" for i, base in enumerate(bases)]


def read_answers(path: Path) -> dict[str, str]:
    answers = read_json(path)
    if not all(isinstance(value, str) for value in answers.values()):
        raise SystemExit(f'답 파일은 {{"<kind>:<from>-<to>[#순번]": "<사람의 답>"}} 형식입니다: {path}')
    return answers


def answer_problems(rows: list[dict], answers: dict[str, str]) -> list[str]:
    asked = dict(zip(row_keys(rows), (row["ask"] for row in rows)))
    missing = [f"답이 없습니다: {key} ({ask})" for key, ask in asked.items() if not answers.get(key, "").strip()]
    unknown = [f"판정표에 없는 행입니다: {key}" for key in sorted(set(answers) - set(asked))]
    return [*missing, *unknown]
