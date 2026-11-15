#!/usr/bin/env python3
"""두 복원본의 차이를 찾는다. 대사 범위, 말과 생각, 대사 쌍의 경계, 그리고 분할 결과의 문장 경계와 쉼을 본다.

원문의 줄바꿈 차이가 아니라 분할기가 낸 문장을 비교한다. 대부분의 줄바꿈 차이는 문장을 바꾸지 않기 때문이다.
사용: compare_restore.py <id.source.txt> <첫 복원본> <검토 복원본> <첫 draft.json> <검토 draft.json> <판정 폴더>
"""

import hashlib
from itertools import accumulate, groupby
from pathlib import Path

from check_quotes import CLOSING, QUOTE_MARKS, restoration_problems
from guyeon_common import abort_on, arguments, blinded, file_hash, read_json, refuse_existing, write_json_atomic

CONTEXT = 18


def glyphs_of(text: str) -> str:
    return "".join(char for char in text if char not in QUOTE_MARKS and not char.isspace())


def _is_glyph(char: str) -> bool:
    return char not in QUOTE_MARKS and not char.isspace()


def _after_mark(stack: tuple[str, ...], char: str) -> tuple[str, ...]:
    if char in CLOSING:
        return (*stack, char)
    return stack[:-1] if char in CLOSING.values() else stack


def spoken_kinds(text: str) -> tuple[list[str | None], set[int]]:
    """글자별 따옴표 종류와, 여는 따옴표 바로 뒤 글자의 위치."""
    stacks = list(accumulate(text, _after_mark, initial=()))[1:]
    glyphs_before = list(accumulate((_is_glyph(char) for char in text), initial=0))
    kinds = [stack[-1] if stack else None for char, stack in zip(text, stacks) if _is_glyph(char)]
    return kinds, {count for char, count in zip(text, glyphs_before) if char in CLOSING}


def sentence_ends(sentences: list[dict]) -> dict[int, int]:
    lengths = [len(glyphs_of(line["text"])) for line in sentences]
    return {sum(lengths[: i + 1]): line["pauseMs"] for i, line in enumerate(sentences)}


def _name(kind: str | None) -> str:
    return {"“": "소리 낸 말", "‘": "속생각", None: "서술"}[kind]


def _item(kind: str, glyphs: str, span: tuple[int, int], first: str, review: str) -> dict:
    start, end = span
    return {
        "id": f"{kind}:{start}",
        "kind": kind,
        "text": glyphs[start:end],
        "before": glyphs[max(0, start - CONTEXT) : start],
        "after": glyphs[end : end + CONTEXT],
        "first": first,
        "review": review,
    }


def kind_spans(first: list[str | None], review: list[str | None]) -> list[tuple[int, int, str | None, str | None]]:
    """A, B의 값이 같은 구간끼리 묶는다. 구간 첫 글자로 전체를 설명하면 판정자에게 거짓 선택지를 준다."""
    pairs = list(enumerate(zip(first, review)))
    runs = (list(run) for key, run in groupby(pairs, key=lambda item: item[1]) if key[0] != key[1])
    return [(run[0][0], run[-1][0] + 1, run[0][1][0], run[0][1][1]) for run in runs]


def _boundary(ends: dict[int, int], index: int) -> str:
    return f"여기서 문장이 끝남, {ends[index]}ms" if index in ends else "이어짐"


def differences(first_text: str, review_text: str, first_lines: list[dict], review_lines: list[dict]) -> list[dict]:
    glyphs = glyphs_of(first_text)
    first_kinds, first_open = spoken_kinds(first_text)
    review_kinds, review_open = spoken_kinds(review_text)
    spans = kind_spans(first_kinds, review_kinds)
    kind_items = [_item("대사 범위", glyphs, (s, e), _name(a), _name(b)) for s, e, a, b in spans]
    inside = {i for s, e, _, _ in spans for i in range(s, e + 1)}
    pair_items = [
        _item(
            "대사 쌍의 경계",
            glyphs,
            (i, i + 1),
            "새 따옴표" if i in first_open else "앞 대사에 이어짐",
            "새 따옴표" if i in review_open else "앞 대사에 이어짐",
        )
        for i in sorted((first_open ^ review_open) - inside)
    ]
    first_ends, review_ends = sentence_ends(first_lines), sentence_ends(review_lines)
    break_items = [
        _item("문장 경계", glyphs, (i - 1, i), _boundary(first_ends, i), _boundary(review_ends, i))
        for i in sorted(set(first_ends) | set(review_ends))
        if first_ends.get(i) != review_ends.get(i)
    ]
    return [*kind_items, *pair_items, *break_items]


def restore_key(first: Path, review: Path, review_draft: Path, first_side: dict[str, str]) -> dict:
    """apply_restore_verdicts가 판정 뒤 파일이 바뀌지 않았는지, --verify 때 무엇과 다시 비교할지 알도록 경로와 해시를 남긴다."""
    named = {"first": first, "review": review, "reviewDraft": review_draft}
    return {
        **{f"{name}Path": str(path.resolve()) for name, path in named.items()},
        **{f"{name}Hash": file_hash(path) for name, path in named.items()},
        "firstSide": first_side,
    }


def main() -> int:
    usage = "compare_restore.py <id.source.txt> <첫 복원본> <검토 복원본> <첫 draft.json> <검토 draft.json> <판정 폴더>"
    source_path, first_path, review_path, first_draft, review_draft, out = (Path(item) for item in arguments(6, usage))
    refuse_existing(out / "restore.judge.json")
    source, first, review = (path.read_text(encoding="utf-8") for path in (source_path, first_path, review_path))
    abort_on(
        [
            f"{name}: {problem}"
            for name, text in (("첫 복원본", first), ("검토 복원본", review))
            for problem in restoration_problems(source, text)
        ]
    )
    items = differences(first, review, read_json(first_draft)["sentences"], read_json(review_draft)["sentences"])
    shown, key = blinded(items, hashlib.sha256(first.encode()).hexdigest())
    write_json_atomic(out / "restore.judge.json", {"items": shown})
    write_json_atomic(out / "private" / "restore.key.json", restore_key(first_path, review_path, review_draft, key))
    print(f"복원 차이 {len(items)}곳 → {out / 'restore.judge.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
