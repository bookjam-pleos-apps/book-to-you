"""진입점이 같이 쓰는 목록 출력과 실행 중단."""
from collections.abc import Sequence


def print_list(title: str, items: Sequence[object]) -> None:
    if not items:
        return
    print(title, *items, sep="\n  ")


def abort_if(problems: Sequence[object], message: str) -> None:
    if not problems:
        return
    print_list(message, problems)
    raise SystemExit(1)
