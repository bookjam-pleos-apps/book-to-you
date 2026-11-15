import type { RENDERED_FAILURE_CODES } from "./retry-seed";

// 렌더 행을 만들기 전, 계획 단계에서 걸러지는 이유다.
export type PlanFailureCode =
  | "unknown_story"
  | "voice_not_found"
  | "no_active_consent"
  | "no_passed_clip"
  | "unknown_script"
  | "ambiguous_clip"
  | "unrenderable_line";

// 실패한 렌더 행의 error_code에 쓰는 값 전부다. 새 이유를 만들면 여기에 먼저 더한다.
// 쓰는 쪽만 묶는다. DB에는 제약이 없어, 읽은 값으로 분기할 때는 모르는 값도 올 수 있다고 본다.
export type RenderFailureCode =
  | (typeof RENDERED_FAILURE_CODES)[number]
  | PlanFailureCode
  | "script_mismatch"
  | "story_changed"
  | "superseded"
  | "abandoned";
