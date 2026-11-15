import re
from pathlib import Path

from spike.render.attempt.attempt_policy import SEED_STEP

RETRY_SEED = Path(__file__).resolve().parents[4] / "apps/api/src/domain/renders/retry-seed.ts"


def _api_attempt_seed_step() -> int:
    declared = re.search(r"export const ATTEMPT_SEED_STEP = (\d+);", RETRY_SEED.read_text(encoding="utf-8"))
    assert declared is not None, f"{RETRY_SEED}에서 ATTEMPT_SEED_STEP 선언을 찾지 못했습니다"
    return int(declared.group(1))


def test_api_retry_seed_moves_within_the_attempt_step_of_the_renderer():
    assert SEED_STEP == _api_attempt_seed_step()
