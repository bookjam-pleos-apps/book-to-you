import { stepAfter, type VoiceStep } from "./voice-steps";

export const NEW_VOICE_PATH = "/voices/new";

export const voiceDetailPath = (voiceId: string): string => `/voices/${voiceId}`;

export const voiceNamePath = (voiceId: string): string => `/voices/${voiceId}/name`;

// only는 상세 화면에서 한 가지만 다시 녹음하러 온 경우다. 끝나면 상세로 돌아간다.
export const recordStepPath = (voiceId: string, step: VoiceStep, only = false): string =>
  `/voices/${voiceId}/record/${step}${only ? "?only=1" : ""}`;

export const voiceDonePath = (voiceId: string): string => `/voices/${voiceId}/done`;

export const isOnlyMode = (search: string): boolean => new URLSearchParams(search).get("only") === "1";

export const nextPath = (voiceId: string, step: VoiceStep, only: boolean): string => {
  if (only) return voiceDetailPath(voiceId);
  const next = stepAfter(step);
  return next === "done" ? voiceDonePath(voiceId) : recordStepPath(voiceId, next);
};
