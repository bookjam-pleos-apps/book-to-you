#!/usr/bin/env python3
"""대사 복원본이 원고의 낱말과 띄어쓰기를 바꾸지 않았고 따옴표가 분할기에 안전한지 확인한다.

사용: check_quotes.py <id.source.txt> <id.quoted.txt>
"""

import re
from functools import reduce
from itertools import accumulate
from pathlib import Path

from guyeon_common import PARAGRAPH_GAP, SINGLE_BREAK, arguments

QUOTE_MARKS = "“”‘’\"'"
CLOSING = {"“": "”", "‘": "’"}


WORD_APOSTROPHE = re.compile(r"(?<=\w)'(?=\w)")
WORD_LETTER = re.compile(r"[가-힣A-Za-z]")
APOSTROPHE_MARK = "\ue000"


def plain(text: str) -> str:
    """낱말 속 곧은따옴표는 대사 표시가 아니라 글자로 남긴다. 지우면 `엄마's`가 `엄마s`로 바뀌어도 통과한다."""
    kept = WORD_APOSTROPHE.sub(APOSTROPHE_MARK, text)
    without_quotes = "".join(char for char in kept if char not in QUOTE_MARKS)
    return " ".join(without_quotes.split())


def first_difference(source: str, quoted: str) -> str | None:
    if source == quoted:
        return None
    position = next((i for i, (left, right) in enumerate(zip(source, quoted)) if left != right), min(len(source), len(quoted)))
    return f"낱말이나 띄어쓰기가 다릅니다. 원고: {source[position : position + 30]!r} / 복원본: {quoted[position : position + 30]!r}"


def spare_closers(paragraph: str) -> list[int]:
    """spare[i]는 i번째 글자 뒤에 남은 `’` 수에서 `‘` 수를 뺀 값이다."""
    steps = [(char == "’") - (char == "‘") for char in paragraph]
    return list(accumulate(reversed(steps), initial=0))[::-1][1:]


def is_apostrophe(stack: tuple[str, ...], before: str, char: str, after: str, spare: int) -> bool:
    """spike story_split.is_apostrophe와 같은 규칙이다. 글자 사이의 `’`는 `‘`가 열려 있지 않거나,
    열린 `‘`를 모두 닫을 `’`가 뒤에 남을 때 아포스트로피다(‘rock’n’roll이야’). 남지 않으면 닫는다(‘엄마’가).
    """
    if char != "’" or not (WORD_LETTER.fullmatch(before) and WORD_LETTER.fullmatch(after)):
        return False
    return "’" not in stack or stack.count("’") <= spare


def _after_char(stack: tuple[str, ...], around: tuple[str, str, str, int]) -> tuple[str, ...]:
    before, char, after, spare = around
    if is_apostrophe(stack, before, char, after, spare):
        return stack
    if stack and char == stack[-1]:
        return stack[:-1]
    if char in CLOSING:
        return (*stack, CLOSING[char])
    if char in CLOSING.values():
        raise ValueError(f"따옴표가 어긋납니다({char})")
    return stack


def paragraph_problem(paragraph: str) -> str | None:
    around = zip(f" {paragraph}", paragraph, f"{paragraph[1:]} ", spare_closers(paragraph))
    try:
        stack = reduce(_after_char, around, ())
    except ValueError as error:
        return f"{error}: {paragraph[:50]}"
    return f"닫히지 않은 따옴표가 있습니다: {paragraph[:50]}" if stack else None


def restoration_problems(source: str, quoted: str) -> list[str]:
    if not quoted.strip():
        return ["복원본이 비어 있습니다"]
    if SINGLE_BREAK.search(source):
        return ["원고에 접힌 줄이 남아 있습니다. prepare_manuscript.py를 먼저 실행하세요"]
    straight = [
        f"곧은따옴표는 쓸 수 없습니다({mark}): 곡선 따옴표로 바꾸고, 낱말 속 표기는 사람에게 물어 원고를 고치세요"
        for mark in "\"'"
        if mark in quoted
    ]
    paragraphs = [item for item in PARAGRAPH_GAP.split(quoted) if item.strip()]
    return [item for item in (*straight, first_difference(plain(source), plain(quoted)), *map(paragraph_problem, paragraphs)) if item]


def paragraphs_of(text: str) -> int:
    return len([item for item in PARAGRAPH_GAP.split(text) if item.strip()])


def structure_notes(source: str, quoted: str) -> list[str]:
    """빈 줄을 지우면 900ms 쉼이 사라지므로 조용히 넘기지 않는다."""
    before, after = paragraphs_of(source), paragraphs_of(quoted)
    marks = sum(source.count(mark) for mark in "“‘")
    return [
        *([f"원고 문단 {before}개가 {after}개로 바뀌었습니다. 판정표에 적으세요"] if before != after else []),
        *(
            ["원고에 있던 따옴표가 줄었습니다. 원고의 대사 표시를 지우지 않았는지 확인하세요"]
            if sum(quoted.count(mark) for mark in "“‘") < marks
            else []
        ),
    ]


def ineffective_breaks(quoted: str) -> int:
    """따옴표 옆이 아닌 줄바꿈은 분할기가 공백으로 읽어 문장을 나누지 않는다."""
    gaps = (quoted[max(0, match.start() - 1) : match.end() + 1] for match in SINGLE_BREAK.finditer(quoted))
    return sum(not any(mark in gap for mark in "“”‘’") and gap[0] not in ".!?…" for gap in gaps)


def main() -> int:
    source_path, quoted_path = (Path(item) for item in arguments(2, "check_quotes.py <id.source.txt> <id.quoted.txt>"))
    source, quoted = source_path.read_text(encoding="utf-8"), quoted_path.read_text(encoding="utf-8")
    problems = restoration_problems(source, quoted)
    if problems:
        print("\n".join(problems))
        return 1
    breaks = len(SINGLE_BREAK.findall(quoted))
    print(f"통과: 낱말 동일, 문단 {paragraphs_of(quoted)}개, 대사 {quoted.count('“')}쌍, 생각 {quoted.count('‘')}쌍, 줄바꿈 {breaks}곳")
    print("\n".join(structure_notes(source, quoted)) or "문단 구조 그대로")
    if ineffective_breaks(quoted):
        print(f"경고: 따옴표 옆이 아니라 문장을 나누지 못하는 줄바꿈이 {ineffective_breaks(quoted)}곳 있습니다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
