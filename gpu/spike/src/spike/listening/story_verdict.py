"""3단계 채택선. 듣기 전에 고정한 값이다. 결과를 본 뒤에 바꾸지 않는다. 순수 로직."""
from collections.abc import Collection, Sequence
from dataclasses import dataclass

MIN_CONTEXT_USED = 22
MAX_FAILED_UNITS = 1
MIN_CONTINUITY_PICKS = 5
MIN_MONOTONY_PICKS = 2
MIN_LIKENESS_PICKS = 3
MAX_BOUNDARY_MARKS = 3
MAX_LATE_EXCESS = 1
FIRST_LATE_BOUNDARY = 13
BOUNDARY_WINDOW_SEC = 4.0
BOUNDARY_TOLERANCE_SEC = 1.0
FRONT, BACK = "앞", "뒤"
QUESTIONS = 3


@dataclass(frozen=True)
class RenderValidity:
    context_used: int
    failed: int

    @property
    def valid(self) -> bool:
        return self.context_used >= MIN_CONTEXT_USED and self.failed <= MAX_FAILED_UNITS


@dataclass(frozen=True)
class StoryVerdict:
    continuity_picks: int
    monotony_picks: int
    likeness_picks: int
    boundary_marks: int
    early_marks: int
    late_marks: int
    repeats: int
    playable: bool
    passed: bool


def picks_of_chain(picks: Sequence[str], chain_is_front: Sequence[bool]) -> list[int]:
    """쌍마다 적은 앞/뒤에서 체이닝을 고른 횟수를 질문별로 센다."""
    if len(picks) != len(chain_is_front) or any(len(answer) != QUESTIONS or set(answer) - {FRONT, BACK} for answer in picks):
        raise ValueError(f"쌍마다 앞/뒤 {QUESTIONS}개가 필요합니다: {picks}")
    chosen = [FRONT if front else BACK for front in chain_is_front]
    return [sum(answer[question] == side for answer, side in zip(picks, chosen)) for question in range(QUESTIONS)]


def marked_boundary(mark_sec: float, unit_starts_sec: Sequence[float]) -> int | None:
    """묶음 시작 뒤 4초 안의 지목이면 그 경계 번호. 쉼에 찍힌 지목도 다음 묶음의 시작으로 본다. 첫 묶음 앞에는 경계가 없다.

    묶음이 짧으면 창이 겹치므로 가장 나중에 시작한 묶음을 고른다.
    """
    return next(
        (
            unit
            for unit, start in reversed(list(enumerate(unit_starts_sec)))
            if unit > 0 and -BOUNDARY_TOLERANCE_SEC <= mark_sec - start <= BOUNDARY_WINDOW_SEC
        ),
        None,
    )


def story_verdict(
    continuity_picks: int,
    monotony_picks: int,
    likeness_picks: int,
    boundaries: Collection[int],
    repeats: int,
    playable: bool,
) -> StoryVerdict:
    late = sum(boundary >= FIRST_LATE_BOUNDARY for boundary in boundaries)
    early = len(boundaries) - late
    passed = (
        continuity_picks >= MIN_CONTINUITY_PICKS
        and monotony_picks >= MIN_MONOTONY_PICKS
        and likeness_picks >= MIN_LIKENESS_PICKS
        and len(boundaries) <= MAX_BOUNDARY_MARKS
        and late <= early + MAX_LATE_EXCESS
        and repeats == 0
        and playable
    )
    return StoryVerdict(continuity_picks, monotony_picks, likeness_picks, len(boundaries), early, late, repeats, playable, passed)
