"""판정 파일의 규칙. 라벨 판정(apply_verdicts)과 복원 판정(apply_restore_verdicts)이 함께 쓴다."""

from pathlib import Path

from guyeon_common import abort_on, read_json

HUMAN = "사람"


def verdict_problems(verdicts: dict[str, dict], key: dict[str, str]) -> list[str]:
    missing = [f"판정이 없습니다: {item}" for item in sorted(set(key) - set(verdicts))]
    unknown = [f"없는 항목의 판정입니다: {item}" for item in sorted(set(verdicts) - set(key))]
    invalid = [
        f"{item}: 판정은 A, B, 사람 중 하나입니다" for item, value in verdicts.items() if value.get("verdict") not in ("A", "B", HUMAN)
    ]
    blank = [f"{item}: 이유가 없습니다" for item, value in verdicts.items() if not str(value.get("reason", "")).strip()]
    return [*missing, *unknown, *invalid, *blank]


def source_of(verdict: str, first_side: str) -> str:
    return "first" if verdict in (HUMAN, first_side) else "review"


def read_verdicts(path: Path, key: dict[str, str]) -> dict[str, dict]:
    items = read_json(path)["items"]
    ids = [item["id"] for item in items]
    abort_on([f"판정이 두 번 나옵니다: {item}" for item in sorted({i for i in ids if ids.count(i) > 1})])
    verdicts = {item["id"]: item for item in items}
    abort_on(verdict_problems(verdicts, key))
    return verdicts


def reconciled(verdicts: dict[str, dict], second: dict[str, dict], key: dict[str, str], second_key: dict[str, str]) -> dict[str, dict]:
    """A, B를 바꿔 본 두 판정이 다른 쪽을 고르면 내용이 아니라 자리가 판정을 정했을 수 있다. 사람에게 넘긴다."""

    def merged(item: str) -> dict:
        one, two = verdicts[item], second[item]
        if HUMAN in (one["verdict"], two["verdict"]):
            return one if one["verdict"] == HUMAN else two
        if source_of(one["verdict"], key[item]) == source_of(two["verdict"], second_key[item]):
            return one
        return {**one, "verdict": HUMAN, "reason": f"두 판정이 엇갈림: {one['reason']} / {two['reason']}"}

    return {item: merged(item) for item in verdicts}
