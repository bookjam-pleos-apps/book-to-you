#!/usr/bin/env python3
"""복원 판정을 검사하고 첫 복원본에 손으로 고칠 항목을 보여 준다. --verify는 고친 결과가 판정과 맞는지 본다.

사용: apply_restore_verdicts.py <복원 판정 폴더> <verdicts.json> [--verify <고친 첫 복원본> <고친 draft.json>]
고친 복원본은 새 이름으로 만든다. 첫 복원본을 덮어쓰면 판정한 파일이 바뀐 것으로 보고 거부한다.
"""

import sys
from pathlib import Path

from compare_restore import differences
from guyeon_common import abort_on, file_hash, read_json, split_option
from verdict_rules import HUMAN, read_verdicts, source_of

USAGE = "apply_restore_verdicts.py <복원 판정 폴더> <verdicts.json> [--verify <고친 첫 복원본> <고친 draft.json>]"
TRACKED = {"first": "첫 복원본", "review": "검토 복원본", "reviewDraft": "검토 draft"}


def _current_hash(path: Path) -> str | None:
    return file_hash(path) if path.is_file() else None


def changed_files(private: dict) -> list[str]:
    return [
        f"판정한 뒤 {label}이 바뀌었거나 없습니다: {private[f'{name}Path']}. 고친 복원본은 새 이름으로 만들고, 아니면 compare_restore를 새 폴더에 다시 돌리세요"
        for name, label in TRACKED.items()
        if _current_hash(Path(private[f"{name}Path"])) != private[f"{name}Hash"]
    ]


def checked_key(folder: Path) -> dict:
    private = read_json(folder / "private" / "restore.key.json")
    if "firstSide" not in private:
        raise SystemExit("해시가 없는 옛 restore.key.json입니다. compare_restore를 새 폴더에 다시 돌리세요")
    abort_on(changed_files(private))
    return private


def anchor(item: dict) -> tuple[str, str, str, str]:
    # 항목 id의 offset은 원고 낱말이 바뀌면 밀린다. 따옴표·공백을 뺀 글자와 앞뒤 문맥은 따옴표를 고쳐도 그대로라 같은 자리를 찾는 기준으로 쓴다.
    return item["kind"], item["before"], item["text"], item["after"]


def kept_anchors(judged: list[dict], verdicts: dict[str, dict], side: dict[str, str]) -> dict[tuple, str]:
    return {anchor(item): item["id"] for item in judged if source_of(verdicts[item["id"]]["verdict"], side[item["id"]]) == "first"}


def verify_problems(judged: list[dict], verdicts: dict[str, dict], side: dict[str, str], remaining: list[dict]) -> list[str]:
    kept = kept_anchors(judged, verdicts, side)
    left = {anchor(item) for item in remaining}
    return [
        *[f"{item['id']}: 검토 쪽을 골랐는데 아직 차이로 남아 있습니다" for item in judged if anchor(item) not in kept and anchor(item) in left],
        *[f"{item_id}: 첫 쪽(또는 사람)인데 차이가 사라졌습니다" for key, item_id in kept.items() if key not in left],
        *[f"판정에 없던 차이가 생겼습니다: {item['kind']} '{item['text']}'" for item in remaining if anchor(item) not in kept],
    ]


def _remaining(private: dict, fixed_text: Path, fixed_draft: Path) -> list[dict]:
    review_text = Path(private["reviewPath"]).read_text(encoding="utf-8")
    review_lines = read_json(Path(private["reviewDraftPath"]))["sentences"]
    return differences(fixed_text.read_text(encoding="utf-8"), review_text, read_json(fixed_draft)["sentences"], review_lines)


def _print_plan(judged: list[dict], verdicts: dict[str, dict], side: dict[str, str]) -> None:
    def line(item: dict) -> str:
        return f"- {item['id']} '{item['text']}': {verdicts[item['id']]['reason']}"

    to_fix = [line(item) for item in judged if verdicts[item["id"]]["verdict"] not in (HUMAN, side[item["id"]])]
    to_ask = [line(item) for item in judged if verdicts[item["id"]]["verdict"] == HUMAN]
    print("\n".join([f"첫 복원본에서 검토 쪽으로 고칠 항목 {len(to_fix)}개", *to_fix, f"사람에게 넘길 항목 {len(to_ask)}개", *to_ask]))


def main() -> int:
    args, verify = split_option(sys.argv[1:], "--verify", 2)
    if len(args) != 2:
        raise SystemExit(f"사용: {USAGE}")
    folder, verdict_path = (Path(item) for item in args)
    private = checked_key(folder)
    side = private["firstSide"]
    verdicts = read_verdicts(verdict_path, side)
    judged = read_json(folder / "restore.judge.json")["items"]
    _print_plan(judged, verdicts, side)
    if verify is None:
        return 0
    abort_on(verify_problems(judged, verdicts, side, _remaining(private, Path(verify[0]), Path(verify[1]))))
    print("고친 복원본이 판정과 맞습니다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
