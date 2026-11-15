"""클론 출력 하나를 지표로 바꾼다. 채점기는 Protocol로만 알아서 가짜 구현으로 테스트한다."""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from statistics import median
from typing import Protocol

import numpy as np

from spike.sound.audio import Audio
from spike.clone.budget import count_syllables
from spike.clone.catalog import EvalSentence
from spike.clone.plan.clone_plan import CloneJob
from spike.clone.scoring.eval_metrics import cer, syllables_per_sec
from spike.clone.identity import Embedder, cosine
from spike.sound.prosody import PitchTracker, energy_spread_db, f0_range_semitones
from spike.sound.speech_activity import longest_gap_sec

MIN_CEILING_CLIPS = 2
DIGITS = 4
# 지표 계산이 바뀌면 올린다. 클론 fingerprint만으로는 평가기 변경을 알 수 없어 예전 기준의 평가가 섞인다.
# 2: 클립별 무음 기준, longestGapSec, syllables
# 3: 운율(f0RangeSt, energySpreadDb와 천장 대비 비율), sentenceId
# 4: 동일인 게이트에서 떨어진 천장 클립을 기준점에서 뺀다
# 5: referenceIdentityOk, gateFingerprint
# 6: 남의 calm과 가르지 못하는 기준점은 비운다(discriminability)
EVAL_VERSION = 6


class Transcriber(Protocol):
    def transcribe(self, audio: Audio) -> str: ...


@dataclass(frozen=True)
class Scorers:
    transcriber: Transcriber
    embedder: Embedder
    pitch_tracker: PitchTracker


@dataclass(frozen=True)
class SpeakerBaseline:
    """실제 녹음끼리 잰 기준값. 천장 녹음이 2개 미만이면 비교할 수 없어 비어 있다.

    말속도와 운율은 스타일마다 다르다(신남은 빠르고 높낮이가 크다). 그래서 같은 스타일로 읽은 녹음끼리만 비교한다.
    """
    anchor: np.ndarray | None = None
    ceiling_similarity: float | None = None
    syllables_per_sec_by_style: Mapping[str, float] = field(default_factory=dict)
    f0_range_by_style: Mapping[str, float] = field(default_factory=dict)
    energy_spread_by_style: Mapping[str, float] = field(default_factory=dict)


def speaker_baseline(clips: Sequence[tuple[EvalSentence, Audio]], scorers: Scorers) -> SpeakerBaseline:
    if len(clips) < MIN_CEILING_CLIPS:
        return SpeakerBaseline()
    embeddings = [scorers.embedder.embed(audio) for _, audio in clips]
    return SpeakerBaseline(
        anchor=np.mean(embeddings, axis=0),
        ceiling_similarity=median(_leave_one_out_similarities(embeddings)),
        syllables_per_sec_by_style=_median_by_style(clips, lambda s, audio: syllables_per_sec(s.text, audio)),
        f0_range_by_style=_median_by_style(clips, lambda _, audio: f0_range_semitones(scorers.pitch_tracker.track(audio))),
        energy_spread_by_style=_median_by_style(clips, lambda _, audio: energy_spread_db(audio)),
    )


def _median_by_style(
    clips: Sequence[tuple[EvalSentence, Audio]], measure: Callable[[EvalSentence, Audio], float | None]
) -> dict[str, float]:
    measured = [(s.style, measure(s, audio)) for s, audio in clips]
    values = [(style, value) for style, value in measured if value is not None]
    styles = sorted({style for style, _ in values})
    return {style: median(value for s, value in values if s == style) for style in styles}


def _leave_one_out_similarities(embeddings: list[np.ndarray]) -> list[float]:
    """천장값도 '본 적 없는 문장'과 비교해야 클론 유사도와 공정하게 맞선다."""
    return [
        cosine(embedding, np.mean(embeddings[:i] + embeddings[i + 1:], axis=0))
        for i, embedding in enumerate(embeddings)
    ]


def evaluate_clone(job: CloneJob, audio: Audio, hit_budget: bool, scorers: Scorers, baseline: SpeakerBaseline) -> dict:
    return {
        **_job_fields(job),
        **_reading_fields(job, audio, hit_budget, scorers.transcriber),
        **_voice_fields(job, audio, scorers.embedder, baseline),
        **_prosody_fields(job, audio, scorers.pitch_tracker, baseline),
    }


def _job_fields(job: CloneJob) -> dict:
    return {
        "experiment": job.experiment.id,
        "speaker": job.speaker_id,
        "condition": job.condition,
        "sentenceId": job.sentence.id,
        "sentenceStyle": job.sentence.style,
        "syllables": count_syllables(job.sentence.text),
        "referenceStyle": job.reference_style,
        "fingerprint": job.fingerprint,
        "evalVersion": EVAL_VERSION,
    }


def _reading_fields(job: CloneJob, audio: Audio, hit_budget: bool, transcriber: Transcriber) -> dict:
    """제대로 읽었나: 전사 오류, 상한 도달, 문장 중간 멈춤."""
    transcript = transcriber.transcribe(audio)
    return {
        "transcript": transcript,
        "cer": round(cer(job.sentence.text, transcript), DIGITS),
        "hitBudget": hit_budget,
        "longestGapSec": round(longest_gap_sec(audio), DIGITS),
    }


def _voice_fields(job: CloneJob, audio: Audio, embedder: Embedder, baseline: SpeakerBaseline) -> dict:
    """같은 사람처럼 들리나: 천장 녹음 대비 화자 유사도와 같은 스타일 말속도."""
    similarity = cosine(embedder.embed(audio), baseline.anchor) if baseline.anchor is not None else None
    rate = syllables_per_sec(job.sentence.text, audio)
    return {
        "speakerSim": _rounded(similarity),
        "simRatio": _rounded(_ratio(similarity, baseline.ceiling_similarity)),
        "rateRatio": _rounded(_ratio(rate, baseline.syllables_per_sec_by_style.get(job.sentence.style))),
    }


def _prosody_fields(job: CloneJob, audio: Audio, pitch_tracker: PitchTracker, baseline: SpeakerBaseline) -> dict:
    """감정이 실렸나: 같은 스타일 천장 녹음 대비 음높이 폭과 강세 폭."""
    f0_range = f0_range_semitones(pitch_tracker.track(audio))
    energy_spread = energy_spread_db(audio)
    style = job.sentence.style
    return {
        "f0RangeSt": _rounded(f0_range),
        "energySpreadDb": _rounded(energy_spread),
        "f0RangeRatio": _rounded(_ratio(f0_range, baseline.f0_range_by_style.get(style))),
        "energyRatio": _rounded(_ratio(energy_spread, baseline.energy_spread_by_style.get(style))),
    }


def _ratio(value: float | None, base: float | None) -> float | None:
    if value is None or not base:
        return None
    return value / base


def _rounded(value: float | None) -> float | None:
    return None if value is None else round(value, DIGITS)
