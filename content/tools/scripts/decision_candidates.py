#!/usr/bin/env python3
"""사람이 결정할 항목 후보를 소리에 미치는 영향 순으로 고른다. 주석만 바뀌는 항목은 참고로 내린다.

판정자가 못 가린 항목은 행 수와 상관없이 모두 올린다. 사람이 답하지 않으면 확정할 수 없기 때문이다.
사용: decision_candidates.py <최종 초안.draft.json> <후보.json> [행 수, 기본 9. 원고 제안 자리는 남겨 둔다]
"""

import random
import sys
from itertools import groupby
from pathlib import Path

from guyeon_common import audible, cast_styles, changes_sound, read_json, syllables, write_json_atomic
from rule_warnings import rule_warnings

MAX_ROWS = 9
LONG_RUN_SENTENCES = 4
LONG_RUN_SYLLABLES = 100
SAMPLES = 2
# 기쁨은 excited, 슬픔과 무서움은 soft, 화남은 calm으로 읽는다. 다른 녹음에 맞는 감정이 어긋남이다.
MISMATCHES = {"excited": {"sadness", "fear", "anger"}, "soft": {"joy", "anger"}}


def _decided_by_cast(lines: list[dict], fixed: dict[str, str]) -> bool:
    """녹음을 정한 인물의 대사는 문장마다 묻지 않는다. cast_rows가 인물 하나에 한 번 묻는다."""
    return all(line.get("speaker") in fixed for line in lines)


def cast_rows(lines: list[dict], fixed: dict[str, str]) -> list[dict]:
    """범위는 첫 대사 하나로 둔다. 인물의 첫 대사부터 끝 대사까지로 두면 사이의 서술까지 다룬 것으로 셈해 표본에서 빠진다."""
    spoken = {name: [line for line in lines if line.get("speaker") == name] for name in fixed}
    return [_cast_row(name, fixed[name], own) for name, own in spoken.items() if own]


def _cast_row(name: str, style: str, own: list[dict]) -> dict:
    clash = sorted({line["emotion"] for line in own} & MISMATCHES.get(style, set()))
    note = f" ({', '.join(clash)} 대사 포함)" if clash else ""
    return {**_run_row(own[:1], "인물 녹음", f"{name}의 대사 {len(own)}개를 모두 {style}로 읽을까요{note}"), "style": style}


def style_runs(lines: list[dict]) -> list[list[dict]]:
    return [list(run) for _, run in groupby(lines, key=lambda line: audible(line["suggestedStyle"]))]


def _run_row(run: list[dict], kind: str, ask: str) -> dict:
    return {
        "kind": kind,
        "from": run[0]["index"],
        "to": run[-1]["index"],
        "style": run[0]["suggestedStyle"],
        "ask": ask,
        "text": run[0]["text"][:40],
    }


def long_runs(runs: list[list[dict]], fixed: dict[str, str] | None = None) -> list[dict]:
    return [
        _run_row(run, "긴 구간", "이 구간 전체를 이 목소리로 읽을까요")
        for run in runs
        if audible(run[0]["suggestedStyle"]) != "calm" and not _decided_by_cast(run, fixed or {})
        and (len(run) >= LONG_RUN_SENTENCES or sum(syllables(line["text"]) for line in run) >= LONG_RUN_SYLLABLES)
    ]


def isolated(runs: list[list[dict]], fixed: dict[str, str] | None = None) -> list[dict]:
    return [
        _run_row(run, "튀는 문장", "이 문장만 참조를 바꿀까요")
        for position, run in enumerate(runs)
        if len(run) == 1 and audible(run[0]["suggestedStyle"]) != "calm" and 0 < position < len(runs) - 1
        and not _decided_by_cast(run, fixed or {})
    ]


def ending(lines: list[dict], scenes: list[dict]) -> list[dict]:
    """내용만 보면 결말의 사건이 신나게 읽힌다. 이야기 위치로 정할 일이라 항상 묻는다. 범위는 마지막 장면이다."""
    if not lines:
        return []
    start = scenes[-1]["from"] if scenes else lines[-1]["index"]
    last = lines[-1]
    return [
        {
            "kind": "결말",
            "from": start,
            "to": last["index"],
            "style": audible(last["suggestedStyle"]),
            "ask": f"결말을 {audible(last['suggestedStyle'])} 목소리로 끝낼까요",
            "text": last["text"][:40],
        }
    ]


def mismatches(lines: list[dict], fixed: dict[str, str] | None = None) -> list[dict]:
    """인물 녹음으로 정한 대사의 어긋남은 cast_rows가 인물 단위로 묻는다."""
    return [
        _run_row([line], "감정과 목소리 어긋남", f"{line['emotion']} 대목을 {line['suggestedStyle']}로 읽을까요")
        for line in lines
        if line["emotion"] in MISMATCHES.get(line["suggestedStyle"], ()) and line.get("speaker") not in (fixed or {})
    ]


def style_decisions(decisions: list[dict]) -> list[dict]:
    return [
        {
            "kind": "판정자가 못 가림",
            "from": item["index"],
            "to": item["index"],
            "first": item["first"],
            "review": item["review"],
            "ask": "어느 목소리로 읽을까요",
            "text": item["text"][:40],
            "reason": item["reason"],
        }
        for item in decisions
        if changes_sound(item)
    ]


REVIEW_NOTE = "검수 요청: "


def review_rows(lines: list[dict], judged: set[int]) -> list[dict]:
    """판정자가 이미 정한 문장은 다시 묻지 않는다. 한 문장의 요청은 한 행으로 묶는다. 행이 나뉘면 뒤 요청이 넘친 목록으로 밀려 묻지 않게 된다."""
    asks = [(line, [note.removeprefix(REVIEW_NOTE) for note in line["notes"] if note.startswith(REVIEW_NOTE)]) for line in lines]
    return [_run_row([line], "검수 요청", " / ".join(notes)) for line, notes in asks if notes and line["index"] not in judged]


def samples(lines: list[dict], taken: set[int], seed: str, fixed: dict[str, str] | None = None) -> list[dict]:
    pool = [
        line for line in lines
        if line["index"] not in taken and line.get("speaker") not in (fixed or {})
        and (audible(line["suggestedStyle"]) != "calm" or line["emotion"] != "neutral")
    ]
    picked = random.Random(seed).sample(pool, min(SAMPLES, len(pool)))
    return [
        _run_row([line], "합의 표본", f"{audible(line['suggestedStyle'])} 목소리로 읽어도 될까요")
        for line in sorted(picked, key=lambda line: line["index"])
    ]


def _row_limit() -> int:
    if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and not sys.argv[3].isdigit()):
        raise SystemExit("사용: decision_candidates.py <최종 초안.draft.json> <후보.json> [행 수]")
    return int(sys.argv[3]) if len(sys.argv) == 4 else MAX_ROWS


def split_by_start(rows: list[dict], taken: set[int]) -> tuple[list[dict], list[dict]]:
    """같은 문장에서 시작하는 후보는 앞선 것만 행으로 두고, 나머지는 버리지 않고 넘친 목록으로 보낸다."""
    earliest = {row["from"]: position for position, row in reversed(list(enumerate(rows)))}
    is_kept = [earliest[row["from"]] == position and row["from"] not in taken for position, row in enumerate(rows)]
    return [row for row, keep in zip(rows, is_kept) if keep], [row for row, keep in zip(rows, is_kept) if not keep]


def candidate_table(document: dict, limit: int = MAX_ROWS) -> dict:
    lines, runs, fixed = document["sentences"], style_runs(document["sentences"]), cast_styles(document.get("cast", []))
    must = style_decisions(document.get("decisions", []))
    judged = set(document.get("judged", []))
    ranked = [
        *ending(lines, document.get("scenes", [])),
        *cast_rows(lines, fixed),
        *long_runs(runs, fixed),
        *mismatches(lines, fixed),
        *isolated(runs, fixed),
        *review_rows(lines, judged),
    ]
    unique, duplicates = split_by_start(ranked, {row["from"] for row in must})
    covered = judged | {i for row in [*must, *unique] for i in range(row["from"], row["to"] + 1)}
    sampled = samples(lines, covered, document["id"], fixed)
    room = max(0, limit - len(must) - len(sampled))
    rows, overflow = [*must, *unique[:room], *sampled], [*unique[room:], *duplicates]
    notes_only = [item for item in document.get("decisions", []) if not changes_sound(item)]
    return {"rows": rows, "overflow": overflow, "annotationOnly": notes_only, "ruleChecks": rule_warnings(document)}


def main() -> int:
    limit = _row_limit()
    table = candidate_table(read_json(Path(sys.argv[1])), limit)
    write_json_atomic(Path(sys.argv[2]), table)
    rows, overflow, notes_only, checks = (len(table[key]) for key in ("rows", "overflow", "annotationOnly", "ruleChecks"))
    print(f"결정 후보 {rows}행, 넘친 항목 {overflow}개, 주석만 바뀌는 판정 {notes_only}개, 규칙 경고 {checks}개 → {sys.argv[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
