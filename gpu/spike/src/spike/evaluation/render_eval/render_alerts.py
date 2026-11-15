"""렌더 뒤 경보(alerts.json)의 내용을 만든다. 외부 라이브러리 없는 순수 로직이다.

자동 판정과 재생성은 하지 않는다. 사람이 먼저 들을 곳을 짚을 뿐이다.
값은 모두 렌더 안 순위다. 기준점(렌더 평균 목소리, 렌더 중앙값)이 렌더마다 달라 렌더 사이 비교에 쓰지 않는다.
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from math import ceil, isfinite

import numpy as np

from spike.evaluation.eval_set.eval_set import TITLE_UNIT
from spike.render.trials.unit_pick import SIMILARITY_MAD_LIMIT, mad_low_outliers

BOTTOM_SHARE = 0.1
WINDOW_SEC, HOP_SEC, MIN_SPEECH_SHARE = 8.0, 4.0, 0.5
# KOMOS는 1~5점 척도라 유사도용 MAD 바닥(1e-3)이면 0.005점 차이도 경보가 된다. 배수와 바닥 모두 보정 전 값이다.
KOMOS_MAD_LIMIT, KOMOS_MAD_FLOOR = SIMILARITY_MAD_LIMIT, 0.05
# 창 시각은 story.wav가 단위와 쉼을 그대로 이었다는 가정으로 단위에 대응한다. 효과음처럼 시간축을 바꾸는 작업이 들어오면 대응이 깨진다.
STORY_LENGTH_TOLERANCE_SEC = 0.5
NOT_RANKED_NOTE = "렌더 안 순위다. 렌더 사이 비교와 합격 판정에 쓰지 않는다."


@dataclass(frozen=True)
class WindowSim:
    start_sec: float
    similarity: float


@dataclass(frozen=True)
class AlertInputs:
    """unit_sims와 komos는 단위 번호 순서다. komos가 None이면 KOMOS를 재지 않은 것이다."""
    unit_sims: Sequence[float]
    windows: Sequence[WindowSim]
    unit_starts: Sequence[float]
    story_end_sec: float
    komos: Sequence[float] | None = None


def unmeasured(values: Mapping[int, float]) -> list[int]:
    return sorted(key for key, value in values.items() if not isfinite(value))


def bottom_share(values: Mapping[int, float], share: float = BOTTOM_SHARE) -> list[int]:
    """값이 낮은 쪽 share만큼의 키. 단위가 10개 미만이어도 하나는 짚도록 올림한다. 같은 값이면 앞 번호가 먼저다.

    NaN은 순서가 정해지지 않아 순위에서 빼고 unmeasured로 따로 남긴다.
    """
    finite = {key: value for key, value in values.items() if isfinite(value)}
    count = ceil(len(finite) * share)
    return sorted(sorted(finite, key=lambda key: (finite[key], key))[:count])


def story_length_problem(story_sec: float, units_end_sec: float) -> str | None:
    gap = story_sec - units_end_sec
    if abs(gap) <= STORY_LENGTH_TOLERANCE_SEC:
        return None
    return (f"story.wav {story_sec:.2f}초와 단위·쉼 합 {units_end_sec:.2f}초가 {gap:+.2f}초 다르다"
            f"(허용 {STORY_LENGTH_TOLERANCE_SEC:g}초). 창을 단위에 대응할 수 없다")


def _overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def window_unit(start_sec: float, unit_starts: Sequence[float], story_end_sec: float, window_sec: float = WINDOW_SEC) -> int | None:
    """창과 가장 많이 겹치는 단위. 단위 구간은 뒤 쉼까지 포함해 다음 단위 시작까지다. 같으면 앞 단위다. 겹치는 단위가 없으면 None."""
    ends = [*unit_starts[1:], story_end_sec]
    overlaps = [_overlap(start_sec, start_sec + window_sec, s, e) for s, e in zip(unit_starts, ends)]
    if not overlaps or max(overlaps) <= 0:
        return None
    return int(np.argmax(overlaps))


def _unit_entries(units: Sequence[int], values: Sequence[float], key: str) -> list[dict[str, float | int]]:
    return [{"unit": u, key: round(float(values[u]), 4)} for u in units]


def voice_shift_alert(unit_sims: Sequence[float]) -> dict[str, object]:
    body = {i: float(v) for i, v in enumerate(unit_sims) if i != TITLE_UNIT}
    return {
        "measured": True, "rule": f"단위 ECAPA 임베딩의 렌더 평균(제목 포함) 기준 코사인, 제목 뺀 단위 중 하위 {BOTTOM_SHARE:.0%}(올림, 최소 1개)",
        "units": _unit_entries(bottom_share(body), unit_sims, "similarity"), "unmeasured": unmeasured(body),
    }


def window_shift_alert(windows: Sequence[WindowSim], unit_starts: Sequence[float], story_end_sec: float) -> dict[str, object]:
    """wSIM 창은 단위 2~3개에 걸친다. 사람이 단위 번호로 찾아 듣게 하려고 창 소리를 가장 많이 차지한 단위 하나에 붙인다.

    이 대응은 문서에 없는 규칙이다. 단위 수준 검증(AUC 0.70)은 "단위 머리 3초와 겹치는 창의 최저"로 쟀다.
    제목에 붙는 창은 다른 경보처럼 순위에서 뺀다. 어느 단위와도 겹치지 않는 창은 순위에서 빼고 수만 남긴다.
    """
    found = [window_unit(w.start_sec, unit_starts, story_end_sec) for w in windows]
    owners = {i: owner for i, owner in enumerate(found) if owner is not None}
    ranked = {i: windows[i].similarity for i, owner in owners.items() if owner != TITLE_UNIT}
    chosen = bottom_share(ranked)
    return {
        "measured": True,
        "rule": f"{WINDOW_SEC:g}초 창, {HOP_SEC:g}초 간격, 말소리 {MIN_SPEECH_SHARE:.0%} 미만 창 버림, 창 임베딩 평균 기준 코사인, 하위 {BOTTOM_SHARE:.0%} 창",
        "mapping": "창과 가장 많이 겹치는 단위(단위 구간은 다음 단위 시작까지). 검증 안 된 대응",
        "windowCount": len(windows), "unmappedWindows": len(windows) - len(owners),
        "windows": [{"startSec": round(windows[i].start_sec, 2), "similarity": round(windows[i].similarity, 4), "unit": owners[i]} for i in chosen],
        "units": sorted({owners[i] for i in chosen}), "unmeasured": sorted({owners[i] for i in unmeasured(ranked)}),
    }


def breakage_alert(komos: Sequence[float] | None) -> dict[str, object]:
    """KOMOS는 "목소리 튐" 지목과 반대로 움직여(AUC 0.39) 튐 경보와 섞지 않는다. 문턱은 문서에 숫자가 없어 보정 전이다."""
    if komos is None:
        return {"measured": False}
    body = {i: float(v) for i, v in enumerate(komos) if i != TITLE_UNIT}
    scored = [i for i, v in body.items() if isfinite(v)]
    flagged = mad_low_outliers(np.array([body[i] for i in scored]), KOMOS_MAD_LIMIT, KOMOS_MAD_FLOOR) if scored else []
    return {
        "measured": True, "threshold": "uncalibrated",
        "rule": f"제목 뺀 단위의 KOMOS(단위 앞 10초만)가 렌더 중앙값 − {KOMOS_MAD_LIMIT:g}×MAD 아래(MAD 바닥 {KOMOS_MAD_FLOOR:g}점, 보정 전)",
        "units": _unit_entries([u for u, hit in zip(scored, flagged) if hit], komos, "komos"), "unmeasured": unmeasured(body),
    }


def build_alerts(inputs: AlertInputs) -> dict[str, object]:
    if inputs.komos is not None and len(inputs.komos) != len(inputs.unit_sims):
        raise ValueError(f"KOMOS 점수 {len(inputs.komos)}개와 단위 {len(inputs.unit_sims)}개가 다르다")
    return {
        "note": NOT_RANKED_NOTE, "unitCount": len(inputs.unit_sims), "excludedUnits": [TITLE_UNIT],
        "voiceShift": voice_shift_alert(inputs.unit_sims),
        "voiceShiftWindows": window_shift_alert(inputs.windows, inputs.unit_starts, inputs.story_end_sec),
        "breakage": breakage_alert(inputs.komos),
    }
