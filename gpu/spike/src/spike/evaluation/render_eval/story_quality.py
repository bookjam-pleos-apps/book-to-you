"""전체 렌더의 청취 전 기준. 듣기 전에 고정한 값이고 결과를 본 뒤에 바꾸지 않는다. 통과는 들어 볼 대상이라는 뜻이지 합격이 아니다. 순수 로직."""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from operator import ge, itemgetter, le
from statistics import mean

import numpy as np

from spike.sound.audio import Audio
from spike.clone.budget import count_syllables
from spike.clone.scoring.eval_metrics import MAX_MISSING_CHARS, longest_missing_run
from spike.clone.identity import Embedder, centroid_similarities, cosine
from spike.sound.speech_activity import speech_only, voiced_frames
from spike.render.story_render import RenderedSentence, story_sample_count
from spike.evaluation.render_eval.story_trend import UnitTrend, halves
from spike.listening.story_verdict import MAX_FAILED_UNITS

MAX_EFFECTIVE_RATE = 5.10
MAX_RATE_DRIFT = 0.15
MIN_SIMILARITY = 0.72
MIN_SIMILARITY_CHANGE = -0.03
SIMILARITY_WINDOW_SEC = 8.0
SIMILARITY_HOP_SEC = 4.0
BAR_STYLE = "calm"
FASTEST_UNITS_SHOWN = 3


@dataclass(frozen=True)
class BarCheck:
    name: str
    value: float | None
    limit: float
    passed: bool


def _total_syllables(rendered: Sequence[RenderedSentence]) -> int:
    return sum(count_syllables(item.sentence.text) for item in rendered)


def effective_rate(rendered: Sequence[RenderedSentence]) -> float:
    """쉼을 포함한 이야기 전체의 음절/초. 듣는 사람이 느끼는 속도다."""
    return _total_syllables(rendered) / (story_sample_count(rendered) / rendered[0].audio.sample_rate)


def articulation_rate(rendered: Sequence[RenderedSentence]) -> float:
    """말소리 프레임만 센 음절/초. 빨라진 원인이 발음인지 쉼인지 가른다."""
    voiced_sec = sum(voiced_frames(item.audio).mean() * item.audio.duration_sec for item in rendered)
    return _total_syllables(rendered) / float(voiced_sec)


def rate_drift(differences: Sequence[UnitTrend]) -> float | None:
    """기준 렌더와 같은 대본끼리 뺀 말 속도 차이가 뒤 절반에서 얼마나 더 커지는지."""
    front, back = halves(differences, "syllables_per_sec")
    return None if front is None or back is None else back - front


def _similarities(trends: Sequence[UnitTrend]) -> list[float]:
    return [trend.reference_similarity for trend in trends]


def similarity_mean(trends: Sequence[UnitTrend]) -> float:
    return mean(_similarities(trends))


def similarity_change(trends: Sequence[UnitTrend]) -> float:
    """뒤 ⅓ 평균 − 앞 ⅓ 평균."""
    values = _similarities(trends)
    third = max(1, len(values) // 3)
    return mean(values[-third:]) - mean(values[:third])


def _windows(audio: Audio) -> list[Audio]:
    """창보다 짧은 단위는 통째로 잰다. 마지막 창은 끝에 맞춰 경계 직전의 소리도 재게 한다."""
    size, hop = int(SIMILARITY_WINDOW_SEC * audio.sample_rate), int(SIMILARITY_HOP_SEC * audio.sample_rate)
    last = max(len(audio.samples) - size, 0)
    starts = sorted({*range(0, last + 1, hop), last})
    return [Audio(audio.samples[start:start + size], audio.sample_rate) for start in starts]


def lowest_window_similarity(
    rendered: Sequence[RenderedSentence],
    embedder: Embedder,
    references: Mapping[str, np.ndarray],
) -> float:
    """평균이 가리는 순간 전환을 본다. 참고 지표이고 합격선이 아니다(LACI, arXiv 2609.16989의 wSIM)."""
    return min(
        cosine(embedder.embed(window), references[item.sentence.style])
        for item in rendered
        for window in _windows(item.audio)
    )


def centroid_similarity_mean(rendered: Sequence[RenderedSentence], embedder: Embedder) -> float:
    """렌더 평균 목소리 기준 유사도. 단위마다 말소리 구간을 임베딩해 그 평균(이 렌더의 목소리)과 견준 값의 평균이다.

    참조 녹음과 상관없어 참조가 다른 렌더끼리도 잴 수 있다. 보정에서 청취 지목과 가장 잘 맞았다.
    """
    return mean(centroid_similarities([embedder.embed(speech_only(item.audio)) for item in rendered]))


def fastest_unit_changes(differences: Sequence[UnitTrend], count: int = FASTEST_UNITS_SHOWN) -> list[tuple[int, float]]:
    """기준보다 많이 빨라진 묶음의 번호와 말 속도 차이. 전체 평균이 가리는 튐을 볼 후보다. 차이가 비슷한 묶음이 많아 하나만 고르지 않는다."""
    known = [(index, trend.syllables_per_sec) for index, trend in enumerate(differences) if trend.syllables_per_sec is not None]
    return sorted(known, key=itemgetter(1), reverse=True)[:count]


def style_similarity_means(rendered: Sequence[RenderedSentence], trends: Sequence[UnitTrend]) -> dict[str, float]:
    """style별 자기 참조 유사도 평균. 합격선은 calm에서 정한 값이라 다른 style은 참고로만 본다."""
    styles = {item.sentence.style for item in rendered}
    return {style: similarity_mean(_trends_of_style(rendered, trends, style)) for style in sorted(styles)}


def _trends_of_style(rendered: Sequence[RenderedSentence], trends: Sequence[UnitTrend], style: str) -> list[UnitTrend]:
    return [trend for item, trend in zip(rendered, trends, strict=True) if item.sentence.style == style]


def missing_candidates(rendered: Sequence[RenderedSentence]) -> list[tuple[int, int]]:
    """누락 후보 단위의 번호와 빠진 글자 수. 전사기가 놓친 것도 걸리므로 들어서 확인한다."""
    runs = [longest_missing_run(item.sentence.text, item.transcript) for item in rendered]
    return [(index, run) for index, run in enumerate(runs) if run > MAX_MISSING_CHARS]


def _check(name: str, value: float | None, limit: float, within: Callable[[float, float], bool]) -> BarCheck:
    return BarCheck(name, value, limit, value is not None and within(value, limit))


def story_bar_checks(rendered: Sequence[RenderedSentence], differences: Sequence[UnitTrend], trends: Sequence[UnitTrend]) -> list[BarCheck]:
    """유사도 선은 calm 렌더에서 정했으므로 calm 묶음에만 건다. calm이 없으면 값을 몰라 탈락한다."""
    bar_trends = _trends_of_style(rendered, trends, BAR_STYLE)
    return [
        _check("전체 속도", effective_rate(rendered), MAX_EFFECTIVE_RATE, le),
        _check("속도 누적", rate_drift(differences), MAX_RATE_DRIFT, le),
        _check("유사도 평균", similarity_mean(bar_trends) if bar_trends else None, MIN_SIMILARITY, ge),
        _check("유사도 변화", similarity_change(bar_trends) if bar_trends else None, MIN_SIMILARITY_CHANGE, ge),
        _check("대본 누락 후보", float(len(missing_candidates(rendered))), 0.0, le),
        _check("실패 단위", float(sum(not item.passed for item in rendered)), float(MAX_FAILED_UNITS), le),
    ]
