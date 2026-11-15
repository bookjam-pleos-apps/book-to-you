"""짚인 인물 녹음 단위를 다음 seed로 다시 렌더하며 목소리 판정(voice_rule)을 따른다. 생성과 측정은 주입받는다.

다시 굴린 시도는 QC 재시도 다음 번호(MAX_ATTEMPTS부터)를 쓴다. 그래서 seed가 QC 재시도와 겹치지 않는다(attempt_policy).
QC를 통과하지 못한 시도는 목소리가 좋아도 쓰지 않는다.
"""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS
from spike.render.voice.voice_rule import GroupNorm, Step, VoiceRule, VoiceScore, best_score, next_step

RunAttempt = Callable[[Sequence[int], int], None]
Passed = Callable[[int, int], bool]
Measure = Callable[[int, int], VoiceScore]


@dataclass(frozen=True)
class Takes:
    """한 단위의 QC 통과 시도들(시도 번호, 점수)과 다시 굴린 횟수."""
    scored: tuple[tuple[int, VoiceScore], ...]
    rerolls: int = 0


@dataclass(frozen=True)
class VoiceResult:
    attempt: int
    score: VoiceScore
    rerolls: int
    step: Step


def reroll_attempt(reroll: int) -> int:
    return MAX_ATTEMPTS + reroll


def best_take(takes: Takes, norm: GroupNorm) -> tuple[int, VoiceScore]:
    best = best_score([score for _, score in takes.scored], norm)
    return next(item for item in takes.scored if item[1] == best)


def _step(takes: Takes, norm: GroupNorm, rule: VoiceRule) -> Step:
    return next_step(best_take(takes, norm)[1], takes.rerolls, norm, rule)


def _after_reroll(takes: Takes, unit: int, attempt: int, passed: Passed, measure: Measure) -> Takes:
    scored = (*takes.scored, (attempt, measure(unit, attempt))) if passed(unit, attempt) else takes.scored
    return replace(takes, scored=scored, rerolls=takes.rerolls + 1)


def reroll_rounds(
    state: Mapping[int, Takes], norm: GroupNorm, rule: VoiceRule, run_attempt: RunAttempt, passed: Passed, measure: Measure,
) -> dict[int, VoiceResult]:
    """다시 굴릴 단위가 없을 때까지. 단위마다 rerolls가 늘어 max_rerolls에서 멈추므로 깊이가 제한된다."""
    pending = sorted(unit for unit, takes in state.items() if _step(takes, norm, rule) == "reroll")
    if not pending:
        return {unit: VoiceResult(*best_take(takes, norm), takes.rerolls, _step(takes, norm, rule)) for unit, takes in state.items()}
    attempt = reroll_attempt(state[pending[0]].rerolls)
    same_round = [unit for unit in pending if state[unit].rerolls == state[pending[0]].rerolls]
    run_attempt(same_round, attempt)
    updated = {**state, **{unit: _after_reroll(state[unit], unit, attempt, passed, measure) for unit in same_round}}
    return reroll_rounds(updated, norm, rule, run_attempt, passed, measure)
