import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { isOptionalStyle, isStyle, OPTIONAL_STYLES, STYLES, type Style } from "@voice-storybook/shared/vocab";

type ClipStatus = VoiceResponse["progress"][number]["status"];

const REQUIRED_STYLES: readonly Style[] = STYLES.filter((style) => !isOptionalStyle(style));

// 등록 흐름은 필수 녹음만 순서대로 거친다. 선택 녹음은 완료 화면과 홈 카드에서 따로 권한다.
export const VOICE_STEPS = ["consent", ...REQUIRED_STYLES, "belt"] as const;

export type VoiceStep = "consent" | Style | "belt";

export type ResumePoint = VoiceStep | "consent_checking";

const ALL_STEPS: readonly VoiceStep[] = [...VOICE_STEPS, ...OPTIONAL_STYLES];

export const isVoiceStep = (value: unknown): value is VoiceStep => ALL_STEPS.some((step) => step === value);

const isOptionalStep = (step: VoiceStep): boolean => isStyle(step) && isOptionalStyle(step);

export const stepNumber = (step: VoiceStep): number => VOICE_STEPS.indexOf(step) + 1;

// 선택 녹음은 흐름 밖이라 "N단계 중"을 보이지 않는다.
export const stepProgress = (step: VoiceStep): { readonly current: number; readonly total: number } | undefined =>
  isOptionalStep(step) ? undefined : { current: stepNumber(step), total: VOICE_STEPS.length };

export const stepAfter = (step: VoiceStep): VoiceStep | "done" =>
  isOptionalStep(step) ? "done" : (VOICE_STEPS[stepNumber(step)] ?? "done");

export const clipStatusOf = (voice: VoiceResponse, style: Style): ClipStatus =>
  voice.progress.find((item) => item.style === style)?.status ?? "missing";

const needsRecording = (voice: VoiceResponse, style: Style): boolean => {
  const status = clipStatusOf(voice, style);
  return status === "missing" || status === "failed";
};

// 확인 중(checking)인 클립은 통과로 보고 다음으로 넘어간다. 결과는 홈에서 다시 본다.
// 벨트 안내는 읽는 API가 없어 상태를 모른다. 감정 녹음을 마치면 벨트로 보낸다(올리면 교체된다).
// 선택 녹음은 없으면 건너뛰고, 실패했으면 다시 받는다.
export const resumePoint = (voice: VoiceResponse): ResumePoint => {
  if (voice.consent === "checking") return "consent_checking";
  if (voice.consent === "none") return "consent";
  const required = REQUIRED_STYLES.find((style) => needsRecording(voice, style));
  return required ?? OPTIONAL_STYLES.find((style) => clipStatusOf(voice, style) === "failed") ?? "belt";
};

// 하지 않아도 되는 녹음을 아직 하지 않은 상태다. 목록에서 빼고 등록을 마친 뒤 따로 권한다.
export const isUnrecordedOptional = (voice: VoiceResponse, style: Style): boolean =>
  isOptionalStyle(style) && clipStatusOf(voice, style) === "missing";

const isSettled = (voice: VoiceResponse, style: Style): boolean =>
  clipStatusOf(voice, style) === "passed" || isUnrecordedOptional(voice, style);

export const isVoiceReady = (voice: VoiceResponse): boolean =>
  voice.consent === "active" && STYLES.every((style) => isSettled(voice, style));

// 이어서 녹음하기가 거칠 녹음 개수다(resumePoint와 같은 규칙). 낭독 확인도 하나로 세고,
// 선택 녹음은 실패해서 다시 받아야 할 때만 센다.
export const remainingRecordingCount = (voice: VoiceResponse): number =>
  (voice.consent === "none" ? 1 : 0) +
  REQUIRED_STYLES.filter((style) => needsRecording(voice, style)).length +
  OPTIONAL_STYLES.filter((style) => clipStatusOf(voice, style) === "failed").length;

// 아직 녹음하지 않은 선택 녹음. 등록을 마친 뒤 권한다.
export const optionalStyleToOffer = (voice: VoiceResponse): Style | undefined =>
  OPTIONAL_STYLES.find((style) => clipStatusOf(voice, style) === "missing");
