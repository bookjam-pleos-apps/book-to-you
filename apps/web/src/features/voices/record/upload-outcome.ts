import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";

// 업로드 응답은 언제나 checking이다. 전사는 요청 안에서 동기로 돌기 때문에
// 응답 직후 GET /v1/voices/:id를 읽으면 대개 결과가 나와 있다. 전사 서비스가 꺼져 있으면 checking에 머문다.
// advised는 통과했지만 더 잘 읽을 여지가 있는 녹음이다. 바로 넘어가지 않고 코칭을 보여 준다.
export type UploadOutcome = "passed" | "advised" | "failed" | "checking";

export const consentOutcome = (voice: VoiceResponse): UploadOutcome => {
  if (voice.consent === "active") return "passed";
  if (voice.consent === "none" && voice.consentRejected) return "failed";
  return "checking";
};

export const clipOutcome = (voice: VoiceResponse, clipId: string): UploadOutcome => {
  const clip = voice.clips.find(({ id }) => id === clipId);
  if (clip === undefined) return "checking";
  return clip.status === "passed" && clip.advice !== null ? "advised" : clip.status;
};
