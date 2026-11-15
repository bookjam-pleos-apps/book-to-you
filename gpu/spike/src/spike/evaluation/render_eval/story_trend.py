"""묶음별 지표와 두 렌더의 대응 차이를 낸다. 합격 판정이 아니라 누적 변화를 보는 참고 수치다. 순수 로직."""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields
from statistics import mean

import numpy as np

from spike.sound.audio import Audio
from spike.clone.scoring.eval_metrics import syllables_per_sec
from spike.clone.identity import Embedder, cosine
from spike.evaluation.render_eval.long_form_eval import Boundary
from spike.sound.prosody import PitchTracker, f0_range_semitones, median_semitones
from spike.sound.speech_activity import speech_bounds
from spike.render.story_render import RenderedSentence, leveled_units


@dataclass(frozen=True)
class UnitTrend:
    median_semitones: float | None
    f0_range_semitones: float | None
    syllables_per_sec: float | None
    lead_silence_sec: float | None
    reference_similarity: float


METRICS = tuple(field.name for field in fields(UnitTrend))


def _lead_silence_sec(audio: Audio) -> float | None:
    bounds = speech_bounds(audio)
    return None if bounds is None else bounds[0] / audio.sample_rate


def unit_trend(text: str, audio: Audio, tracker: PitchTracker, embedder: Embedder, reference: np.ndarray) -> UnitTrend:
    f0 = tracker.track(audio)
    return UnitTrend(
        median_semitones(f0),
        f0_range_semitones(f0),
        syllables_per_sec(text, audio),
        _lead_silence_sec(audio),
        cosine(embedder.embed(audio), reference),
    )


def rendered_trends(
    units: Sequence[RenderedSentence],
    leveling: str,
    tracker: PitchTracker,
    embedder: Embedder,
    references: Mapping[str, np.ndarray],
) -> list[UnitTrend]:
    leveled = leveled_units(units, leveling)
    return [
        unit_trend(item.sentence.text, audio, tracker, embedder, references[item.sentence.style])
        for item, audio in zip(units, leveled)
    ]


def _difference(baseline: float | None, compared: float | None) -> float | None:
    return None if baseline is None or compared is None else compared - baseline


def paired_differences(baseline: Sequence[UnitTrend], compared: Sequence[UnitTrend]) -> list[UnitTrend]:
    """대본이 같은 묶음끼리 빼서 대본에서 오는 차이를 없앤다. 길이가 다르면 묶음이 어긋났다는 뜻이다."""
    if len(baseline) != len(compared):
        raise ValueError(f"묶음 수가 다릅니다: {len(baseline)}, {len(compared)}")
    return [
        UnitTrend(**{name: _difference(getattr(before, name), getattr(after, name)) for name in METRICS})
        for before, after in zip(baseline, compared)
    ]


def _mean_or_none(values: Sequence[float | None]) -> float | None:
    known = [value for value in values if value is not None]
    return mean(known) if known else None


def mean_abs_f0_change(boundaries: Sequence[Boundary]) -> float | None:
    """음높이를 잴 수 있는 경계가 없으면 None이다."""
    return _mean_or_none([None if item.delta_f0_semitones is None else abs(item.delta_f0_semitones) for item in boundaries])


def halves(trends: Sequence[UnitTrend], metric: str) -> tuple[float | None, float | None]:
    """앞 절반과 뒤 절반의 평균. 뒤쪽이 더 크면 변화가 쌓인다는 신호다."""
    values = [getattr(trend, metric) for trend in trends]
    middle = len(values) // 2
    return _mean_or_none(values[:middle]), _mean_or_none(values[middle:])
