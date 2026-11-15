import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";

import { NEW_VOICE_PATH, recordStepPath } from "../voice-paths";
import { isVoiceReady, remainingRecordingCount, resumePoint, type ResumePoint } from "../voice-steps";

export type CardAction = { readonly label: string; readonly path: string };

// 준비된 목소리는 할 일이 없다(null). 녹음할 것이 남았거나, 확인을 기다리는 목소리만 알린다.
// 확인을 기다릴 때 next는 확인이 끝난 뒤의 일이다(낭독 확인 중이면 아직 녹음이 남아 있다).
export type VoiceTodo =
  | { readonly kind: "record"; readonly remaining: number; readonly path: string }
  | { readonly kind: "checking"; readonly next: "record" | "make" };

// 확인만 기다리는 목소리는 할 녹음이 없다. 확인 결과는 데이터를 다시 받으면 보인다.
const resumePath = (voice: VoiceResponse, point: ResumePoint): string | null =>
  point === "consent_checking" || point === "belt" ? null : recordStepPath(voice.id, point);

// 선택 녹음은 홈에서 권하지 않는다. 목소리 화면의 줄에서만 권한다.
export const voiceTodo = (voice: VoiceResponse): VoiceTodo | null => {
  if (isVoiceReady(voice)) return null;
  const path = resumePath(voice, resumePoint(voice));
  if (path === null) return { kind: "checking", next: remainingRecordingCount(voice) > 0 ? "record" : "make" };
  return { kind: "record", remaining: remainingRecordingCount(voice), path };
};

const firstUnfinished = (voices: readonly VoiceResponse[]): { readonly voiceLabel: string; readonly path: string } | undefined =>
  voices
    .filter((voice) => !isVoiceReady(voice))
    .flatMap((voice) => {
      const path = resumePath(voice, resumePoint(voice));
      return path === null ? [] : [{ voiceLabel: voice.label, path }];
    })[0];

// 준비된 목소리가 없을 때 할 일이다. 녹음 중인 목소리가 있으면 새로 만들지 않고 그 목소리를 마저 녹음한다.
// 확인만 기다리는 목소리뿐이면 할 일이 없다(null).
export const nextVoiceAction = (voices: readonly VoiceResponse[]): CardAction | null => {
  const unfinished = firstUnfinished(voices);
  if (unfinished !== undefined) return { label: `${unfinished.voiceLabel} 목소리 이어서 녹음하기`, path: unfinished.path };
  return voices.length === 0 ? { label: "목소리 추가하기", path: NEW_VOICE_PATH } : null;
};
