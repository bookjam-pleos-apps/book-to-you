"""받아쓰기 방식 비교: 저장된 단위를 새로 받아쓴 결과와 기존 받아쓰기를 같은 기준으로 다시 채점한다. 순수 로직.

받아쓰기 차이만 보려고 두 받아쓰기를 렌더 QC의 받아쓰기 기준(CER과 빠진 구간)으로만 판정한다.
저장된 passed에는 길이 예산과 문맥 반복 판정이 섞여 있어 쓰지 않는다.
"""
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from spike.render.attempt.render_qc import transcript_check
from spike.clone.scoring.whisper_window import join_segments

SAME = "same"
NEWLY_FAILED = "pass_to_fail"
NEWLY_PASSED = "fail_to_pass"
NO_SPEECH = "no_speech"
NOT_TRANSCRIBED = "not_transcribed"
LONG = "long"
SHORT = "short"


@dataclass(frozen=True)
class UnitTranscripts:
    render: str
    index: int
    text: str
    duration_sec: float
    is_long: bool
    old: str
    new_segments: tuple[str, ...]


@dataclass(frozen=True)
class UnitRescore:
    unit: UnitTranscripts
    old_cer: float
    new_cer: float
    old_passed: bool
    new_passed: bool
    category: str


def rescore_category(unit: UnitTranscripts, old_passed: bool, new_passed: bool) -> str:
    """기존 받아쓰기가 비어 있으면 길이 예산 초과로 받아쓰지 않은 단위라 비교에서 뺀다."""
    if not unit.old:
        return NOT_TRANSCRIBED
    if not unit.new_segments:
        return NO_SPEECH
    if old_passed == new_passed:
        return SAME
    return NEWLY_FAILED if old_passed else NEWLY_PASSED


def rescore_unit(unit: UnitTranscripts) -> UnitRescore:
    old = transcript_check(unit.text, unit.old)
    new = transcript_check(unit.text, join_segments(unit.new_segments))
    category = rescore_category(unit, old.passed, new.passed)
    return UnitRescore(unit, old.error_rate, new.error_rate, old.passed, new.passed, category)


def rescore_row(rescore: UnitRescore) -> dict:
    unit = rescore.unit
    return {
        "render": unit.render, "index": unit.index, "durationSec": round(unit.duration_sec, 2), "long": unit.is_long,
        "category": rescore.category, "segments": len(unit.new_segments),
        "oldCer": round(rescore.old_cer, 4), "newCer": round(rescore.new_cer, 4),
        "oldPassed": rescore.old_passed, "newPassed": rescore.new_passed,
        "text": unit.text, "old": unit.old, "new": list(unit.new_segments),
    }


def _window(row: dict) -> str:
    return LONG if row["long"] else SHORT


def summarize_rows(rows: Sequence[dict]) -> dict[str, dict[str, int]]:
    """30초 창 안팎을 나눠 범주별로 센다. 창 안은 같은 워크플로우를 쓰므로 모두 same이어야 한다.

    이어서 측정할 때 앞서 저장한 결과와 함께 세도록 저장 형식(행)을 받는다.
    """
    windows = sorted({_window(row) for row in rows})
    counts = {window: Counter(row["category"] for row in rows if _window(row) == window) for window in windows}
    return {window: dict(sorted(counter.items())) for window, counter in counts.items()}
