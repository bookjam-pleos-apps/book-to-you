"""렌더 하나의 소리에서 경보 입력(단위 유사도, wSIM 창, 단위 시각)을 잰다. 임베더는 주입받는다.

창 규칙은 검증에 쓴 outputs/eval_set/wsim.py와 같다. story_quality._windows는 끝 맞춤에 말소리 거르기가 없어 쓰지 않는다.
"""
from collections.abc import Sequence

from spike.sound.audio import Audio
from spike.evaluation.eval_set.eval_set import Unit, story_end_seconds, unit_start_seconds
from spike.clone.identity import Embedder, centroid_similarities
from spike.evaluation.render_eval.render_alerts import HOP_SEC, MIN_SPEECH_SHARE, WINDOW_SEC, AlertInputs, WindowSim, story_length_problem
from spike.sound.speech_activity import speech_only, voiced_frames


def unit_similarities(embedder: Embedder, units: Sequence[Audio]) -> list[float]:
    """eval_measure.render_rows의 simCentroid와 같은 값: 말소리 구간 임베딩, 제목 포함 평균."""
    return centroid_similarities([embedder.embed(speech_only(audio)) for audio in units])


def speech_windows(story: Audio) -> list[tuple[float, Audio]]:
    size, hop = int(WINDOW_SEC * story.sample_rate), int(HOP_SEC * story.sample_rate)
    starts = range(0, max(len(story.samples) - size, 0) + 1, hop)
    parts = [(s / story.sample_rate, Audio(story.samples[s:s + size], story.sample_rate)) for s in starts]
    return [(t, a) for t, a in parts if voiced_frames(a).mean() >= MIN_SPEECH_SHARE]


def window_similarities(embedder: Embedder, story: Audio) -> list[WindowSim]:
    parts = speech_windows(story)
    if not parts:
        return []
    sims = centroid_similarities([embedder.embed(a) for _, a in parts])
    return [WindowSim(start_sec=t, similarity=sim) for (t, _), sim in zip(parts, sims)]


def alert_inputs(embedder: Embedder, units: Sequence[Unit], unit_audio: Sequence[Audio], story: Audio,
                 komos: Sequence[float] | None) -> AlertInputs:
    """units의 길이는 단위 wav 실제 길이여야 story.wav 시각과 맞는다(eval_set.unit_start_seconds). 어긋나면 ValueError다."""
    story_end = story_end_seconds(units)
    problem = story_length_problem(story.duration_sec, story_end)
    if problem:
        raise ValueError(problem)
    return AlertInputs(
        unit_sims=unit_similarities(embedder, unit_audio),
        windows=window_similarities(embedder, story),
        unit_starts=unit_start_seconds(units),
        story_end_sec=story_end,
        komos=komos,
    )
