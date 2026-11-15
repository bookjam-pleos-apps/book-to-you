#!/usr/bin/env python3
"""원고를 복원 전에 정리한다. 접힌 줄을 펴고, 읽기에 문제가 될 표기를 알려 준다. 글자는 바꾸지 않는다.

사용: prepare_manuscript.py <원고> <id.source.txt> [--lines-are-paragraphs]
"""

import re
import subprocess
import sys
import unicodedata
from pathlib import Path

from guyeon_common import PARAGRAPH_GAP, SINGLE_BREAK, refuse_existing, write_text_atomic

TERMINAL = tuple(".!?…”’\"'")
READING_RISKS = {"숫자": r"\S*\d\S*", "라틴 문자": r"\S*[A-Za-z]\S*", "한자": r"\S*[一-鿿]\S*", "괄호": r"\S*[\[\(（][^\s]*"}


def normalized(raw: str) -> str:
    """풀어쓴 한글(NFD)은 음절로 세지 못해 허용 길이 검사를 지나친다."""
    text = raw.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n").replace("\u00a0", " ")
    return unicodedata.normalize("NFC", text)


def unwrapped(text: str, lines_are_paragraphs: bool) -> str:
    if lines_are_paragraphs:
        return "\n\n".join(line.strip() for line in text.split("\n") if line.strip()) + "\n"
    paragraphs = [" ".join(part.split()) for part in PARAGRAPH_GAP.split(text) if part.strip()]
    return "\n\n".join(paragraphs) + "\n"


def looks_line_per_paragraph(text: str) -> bool:
    """제목 뒤에 빈 줄이 하나 있어도 알아채도록 전체 줄의 비율로 본다."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    gaps = len(PARAGRAPH_GAP.findall(text))
    finished = sum(line.endswith(TERMINAL) for line in lines)
    return len(lines) > 2 and len(lines) > (gaps + 1) * 2 and finished >= len(lines) * 0.8


def wrap_notes(text: str) -> list[str]:
    joined = len(SINGLE_BREAK.findall(text))
    unfinished = sum(1 for match in SINGLE_BREAK.finditer(text) if match.string[max(0, match.start() - 1)] not in TERMINAL)
    return (
        [f"접힌 줄 {joined}곳을 공백으로 폈습니다. 문장 부호 없이 끊긴 줄 {unfinished}곳은 낱말 중간에서 접혔을 수 있으니 확인하세요"]
        if joined
        else []
    )


def reading_risks(text: str) -> list[str]:
    found = ((name, sorted(set(re.findall(pattern, text)))) for name, pattern in READING_RISKS.items())
    return [f"읽기 확인({name}): {', '.join(words[:12])}" for name, words in found if words]


def quote_notes(text: str) -> list[str]:
    straight = text.count('"') + text.count("'")
    curly = sum(text.count(mark) for mark in "“‘")
    return [
        *([f"곧은따옴표 {straight}개: 대사면 곡선 따옴표로 바꾸고, 낱말 속 표기(예: 's)는 사람에게 물어 고칩니다"] if straight else []),
        *([f"이미 곡선 따옴표가 {curly}쌍 있습니다. 빠진 곳만 복원합니다"] if curly else []),
    ]


def ignored_by_git(path: Path) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(["git", "check-ignore", "-q", path.name], cwd=path.parent, capture_output=True)
    return result.returncode == 0


def manuscript_notes(text: str, prepared: str, out: Path, lines_are_paragraphs: bool) -> list[str]:
    return [
        *(
            ["대부분의 줄이 문장 부호로 끝납니다. 줄마다 문단이면 출력을 지우고 --lines-are-paragraphs로 다시 실행하세요"]
            if looks_line_per_paragraph(text) and not lines_are_paragraphs
            else []
        ),
        *([] if lines_are_paragraphs else wrap_notes(text)),
        *quote_notes(prepared),
        *reading_risks(prepared),
        *([] if ignored_by_git(out) else ["경고: git 제외 폴더가 아닙니다. 원고가 커밋될 수 있으니 outputs/drafts/<id>/로 옮기세요"]),
    ]


def main() -> int:
    arguments = [item for item in sys.argv[1:] if item != "--lines-are-paragraphs"]
    if len(arguments) != 2:
        raise SystemExit("사용: prepare_manuscript.py <원고> <id.source.txt> [--lines-are-paragraphs]")
    source, out = Path(arguments[0]), Path(arguments[1])
    refuse_existing(out)
    text = normalized(source.read_text(encoding="utf-8"))
    if not text.strip():
        raise SystemExit(f"원고가 비어 있습니다: {source}")
    lines_are_paragraphs = "--lines-are-paragraphs" in sys.argv
    prepared = unwrapped(text, lines_are_paragraphs)
    write_text_atomic(out, prepared)
    print(f"저장: {out} (문단 {len(PARAGRAPH_GAP.split(prepared.strip()))}개)")
    notes = manuscript_notes(text, prepared, out, lines_are_paragraphs)
    print("\n".join(notes) or "확인할 표기 없음")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
