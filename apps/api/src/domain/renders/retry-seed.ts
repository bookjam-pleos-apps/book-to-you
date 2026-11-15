// 시도마다 seed가 1000씩 커진다(gpu/spike attempt_policy.SEED_STEP, gpu/spike/tests/parity/test_seed_parity.py가 맞춘다). 기준을 1000 안에서만 옮겨야 다른 재요청의 시도 seed와 겹치지 않는다.
export const ATTEMPT_SEED_STEP = 1000;

// 렌더 장비가 실제로 그 seed로 읽은 실패만 센다. 대체·포기·동의 없음처럼 렌더 전에 끝난 실패와 원고가 바뀐 script_mismatch는 seed를 옮길 이유가 없다.
export const RENDERED_FAILURE_CODES = ["sentence_qc_failed", "render_failed", "render_timeout", "render_lost", "render_result_missing"] as const;

// 같은 이야기를 같은 seed로 다시 렌더하면 같은 단위가 같은 이유로 떨어진다. 앞선 실패 수만큼 기준 seed를 옮긴다.
export const baseSeedOf = (policySeed: number, priorFailures: number): number => policySeed + (priorFailures % ATTEMPT_SEED_STEP);
