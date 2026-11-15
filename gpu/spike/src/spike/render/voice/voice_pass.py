"""QC 라운드가 끝난 렌더에서 인물 녹음 단위의 목소리를 재고(voice-embed), 짚인 단위를 다시 굴린다. 어댑터와 순수 판정을 잇는다.

무리마다 첫 판 평균 목소리와 참조 녹음 임베딩을 한 번 재고 고정한다. 다시 굴린 시도는 같은 기준으로 잰다.
"""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from spike.render.attempt.attempt_files import attempt_audio
from spike.clone.identity import cosine
from spike.render.attempt.render_attempts import UnitOutcome
from spike.story.story_plan import StorySentence
from spike.render.voice.voice_rounds import Passed, RunAttempt, Takes, VoiceResult, reroll_rounds
from spike.render.voice.voice_rule import VoiceRule, VoiceScore, flagged_in_group, group_norm, style_groups

EmbedPaths = Callable[[Sequence[Path]], list[np.ndarray]]


@dataclass(frozen=True)
class Anchors:
    centroid: np.ndarray
    reference: np.ndarray

    def score(self, vector: np.ndarray) -> VoiceScore:
        return VoiceScore(cosine(vector, self.centroid), cosine(vector, self.reference))


def _anchored(embed: EmbedPaths, paths: Sequence[Path], reference: Path) -> tuple[Anchors, list[np.ndarray]]:
    *vectors, reference_vector = embed([*paths, reference])
    return Anchors(np.mean(vectors, axis=0), reference_vector), vectors


def _group_results(
    job_dir: Path, members: Sequence[int], chosen: Mapping[int, int], reference: Path, rule: VoiceRule,
    embed: EmbedPaths, run_attempt: RunAttempt, passed: Passed,
) -> dict[int, VoiceResult]:
    anchors, vectors = _anchored(embed, [attempt_audio(job_dir, unit, chosen[unit]) for unit in members], reference)
    scores = {unit: anchors.score(vector) for unit, vector in zip(members, vectors)}
    flagged = flagged_in_group(scores, members, rule)
    norm = group_norm(scores, members, flagged, rule)
    def measure(unit: int, attempt: int) -> VoiceScore:
        return anchors.score(embed([attempt_audio(job_dir, unit, attempt)])[0])

    rerolled = reroll_rounds({unit: Takes(((chosen[unit], scores[unit]),)) for unit in flagged}, norm, rule, run_attempt, passed, measure)
    return {**{unit: VoiceResult(chosen[unit], scores[unit], 0, "keep") for unit in members}, **rerolled}


def voice_pass(
    job_dir: Path, units: Sequence[StorySentence], outcomes: Mapping[int, UnitOutcome], references: Mapping[str, Path],
    rule: VoiceRule, embed: EmbedPaths, run_attempt: RunAttempt, passed: Passed,
) -> dict[int, VoiceResult]:
    """대상 style 단위만 결과가 있다. QC를 끝내 통과하지 못한 단위는 목소리를 판정하지 않는다(받아쓰기 실패가 먼저다)."""
    chosen = {index: outcome.chosen_attempt for index, outcome in outcomes.items() if outcome.passed}
    styles = {index: unit.style for index, unit in enumerate(units) if index in chosen}
    return {
        unit: result
        for style, members in style_groups(styles, rule).items()
        for unit, result in _group_results(job_dir, members, chosen, references[style], rule, embed, run_attempt, passed).items()
    }
