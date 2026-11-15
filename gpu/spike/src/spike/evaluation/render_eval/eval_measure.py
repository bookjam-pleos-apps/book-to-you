"""평가 루프 단위 지표(unit_metrics.json 행)를 만든다. 임베딩과 음높이는 주입받는 순수 로직이다.

행 형식은 run_metric_agreement와 run_compare_renders의 입력 계약이다. 키를 바꾸면 둘 다 깨진다.
"""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

import numpy as np

from spike.sound.audio import Audio
from spike.clone.budget import count_syllables
from spike.evaluation.eval_set.eval_set import Unit
from spike.clone.identity import Embedder, centroid_similarities, cosine
from spike.sound.prosody import PitchTracker, f0_range_semitones, median_semitones
from spike.sound.speech_activity import speech_only

HEAD_SEC = 3.0
TAIL_SEC = 1.5
# 말소리가 거의 없는 단위에서 말 속도가 무한대로 튀지 않게 하는 하한
MIN_SPEECH_SEC = 0.1
QUOTE_OPENERS = ("“", "‘")

ReferenceEmbeddings = Callable[[str], Mapping[str, np.ndarray]]


@dataclass(frozen=True)
class Measured:
    row: Mapping[str, object]
    whole: np.ndarray
    head: np.ndarray
    tail: np.ndarray


def edge(audio: Audio, seconds: float, at_end: bool) -> Audio:
    size = int(seconds * audio.sample_rate)
    return Audio(audio.samples[-size:] if at_end else audio.samples[:size], audio.sample_rate)


def reference_paths(templates: Mapping[str, str], style: str) -> dict[str, str]:
    return {name: template.format(style=style) for name, template in templates.items()}


def reference_sims(embedding: np.ndarray, references: Mapping[str, np.ndarray]) -> dict[str, float]:
    return {name: cosine(embedding, ref) for name, ref in references.items()}


def seconds(audio: Audio) -> float:
    return len(audio.samples) / audio.sample_rate


def _pitch_fields(tracker: PitchTracker, audio: Audio, head: Audio, tail: Audio) -> dict[str, float | None]:
    f0 = tracker.track(audio)
    return {
        "f0": median_semitones(f0), "f0Range": f0_range_semitones(f0),
        "f0Head": median_semitones(tracker.track(head)), "f0Tail": median_semitones(tracker.track(tail)),
    }


def measure_unit(audio: Audio, unit: Unit, report: Mapping[str, object], embedder: Embedder,
                 tracker: PitchTracker, references: ReferenceEmbeddings) -> Measured:
    """audio는 단위 wav 전체(모노)다. 앞뒤 무음을 걷어낸 말소리 구간으로 잰다."""
    spoken = speech_only(audio)
    head, tail = edge(spoken, HEAD_SEC, False), edge(spoken, TAIL_SEC, True)
    whole_emb, head_emb, tail_emb = embedder.embed(spoken), embedder.embed(head), embedder.embed(tail)
    refs = references(unit.style)
    row = {
        "style": unit.style, "durationSec": unit.duration_sec, "speechSec": seconds(spoken),
        "cer": report.get("cer"), "attempts": report.get("attempts"),
        "rate": count_syllables(unit.text) / max(seconds(spoken), MIN_SPEECH_SEC),
        **_pitch_fields(tracker, spoken, head, tail),
        "simWhole": reference_sims(whole_emb, refs), "simHead": reference_sims(head_emb, refs),
        "quote": unit.text.lstrip().startswith(QUOTE_OPENERS),
    }
    return Measured(row=row, whole=whole_emb, head=head_emb, tail=tail_emb)


def render_rows(render: str, measured: Sequence[Measured]) -> list[dict[str, object]]:
    """simCentroid는 렌더 안 단위 임베딩 평균과의 코사인, simPrev는 앞 단위 꼬리와 이 단위 머리의 코사인이다."""
    if not measured:
        return []
    to_centroid = centroid_similarities([m.whole for m in measured])
    previous_tails: list[np.ndarray | None] = [None, *(m.tail for m in measured[:-1])]
    return [
        {**m.row, "render": render, "unit": i, "simCentroid": sim,
         "simPrev": None if prev is None else cosine(m.head, prev)}
        for i, (m, prev, sim) in enumerate(zip(measured, previous_tails, to_centroid))
    ]


def measurement_order(listened: Sequence[str], extra: Sequence[str]) -> list[str]:
    """청취 기록 순서를 지키고, 기록에 없는 추가 렌더만 뒤에 붙인다."""
    return list(dict.fromkeys([*listened, *extra]))
