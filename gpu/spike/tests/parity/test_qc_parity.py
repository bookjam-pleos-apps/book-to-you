import re
from pathlib import Path

from spike.render.attempt.render_qc import MAX_CER

SHARED_QC = Path(__file__).resolve().parents[4] / "packages/shared/src/qc.ts"


def _shared_max_error_rate() -> float:
    declared = re.search(r"export const MAX_SCRIPT_ERROR_RATE = ([0-9.]+);", SHARED_QC.read_text(encoding="utf-8"))
    assert declared is not None, f"{SHARED_QC}에서 MAX_SCRIPT_ERROR_RATE 선언을 찾지 못했습니다"
    return float(declared.group(1))


def test_render_qc_uses_the_error_rate_shared_with_recording_checks():
    assert MAX_CER == _shared_max_error_rate()
