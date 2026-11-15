export const STYLES = ["calm", "excited", "soft", "deep", "child"] as const;

export type Style = (typeof STYLES)[number];

export const isStyle = (value: unknown): value is Style =>
  STYLES.some((style) => style === value);

// 녹음이 없으면 calm으로 읽혀 등록 완료를 막지 않는다. 녹음했다가 검사에 실패하면 다시 받는다.
export const OPTIONAL_STYLES = ["soft"] as const satisfies readonly Style[];

export const isOptionalStyle = (style: Style): boolean => OPTIONAL_STYLES.some((optional) => optional === style);

// 녹음이 확인에서 탈락한 이유다. 대본과 달랐는지, 평소 목소리(calm)와 구별되지 않았는지에 따라 부모가 고칠 점이 다르다.
export const CLIP_FAILURES = ["script_mismatch", "not_distinct"] as const;

export type ClipFailure = (typeof CLIP_FAILURES)[number];

// 통과한 녹음에 붙는 코칭이다. 평소 목소리(calm)와 구별되지 않아도 막지 않고, 더 잘 읽는 법을 알린다.
// CLIP_FAILURES의 not_distinct는 그 결정 전에 탈락한 녹음에만 남아 있다.
export const CLIP_ADVICES = ["not_distinct"] as const;

export type ClipAdvice = (typeof CLIP_ADVICES)[number];

export const CHAPTER_ROLES = ["intro", "body", "ending"] as const;

export type ChapterRole = (typeof CHAPTER_ROLES)[number];

export const PROMPT_KINDS = ["belt_unfastened"] as const;

export type PromptKind = (typeof PROMPT_KINDS)[number];

export const isPromptKind = (value: unknown): value is PromptKind =>
  PROMPT_KINDS.some((kind) => kind === value);

export const REPORT_REASONS = ["voice", "content"] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
