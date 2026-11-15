"""한 단위의 재시도 정책. 몇 번 시도하는지, 시도마다 seed를 어떻게 바꾸는지, 어느 시도를 남기는지. 순수 로직.

Python 렌더(story_render)와 compose 워크플로우의 단계 CLI가 같은 규칙을 쓴다.
화자 일관성 실험의 재시도(consistency.py, seed를 1씩 올리고 유사도로 고름)는 다른 정책이라 여기 넣지 않는다.
"""
from spike.render.attempt.render_qc import AttemptCheck

MAX_ATTEMPTS = 3
SEED_STEP = 1000


def attempt_seed(base_seed: int, attempt: int) -> int:
    return base_seed + attempt * SEED_STEP


def attempts_made(attempt: int) -> int:
    """attempt는 0부터 센다. report에는 실제로 만든 횟수를 적는다."""
    return attempt + 1


def is_last_attempt(attempt: int) -> bool:
    return attempts_made(attempt) >= MAX_ATTEMPTS


def attempts_done(attempt: int, passed: bool) -> bool:
    return passed or is_last_attempt(attempt)


def prefer_later(current: AttemptCheck, later: AttemptCheck) -> bool:
    """앞 시도가 합격했으면 그대로 둔다. 아니면 뒤 시도가 합격했거나 덜 나쁠 때 뒤 시도를 남긴다. 같으면 뒤 시도다."""
    if current.passed:
        return False
    return later.passed or later.failure_rank <= current.failure_rank
