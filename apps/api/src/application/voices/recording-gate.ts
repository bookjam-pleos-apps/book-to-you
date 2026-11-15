import type { ConsentRepo, VoiceRepo } from "./ports";

export type RecordingGateFailure = "not_found" | "no_active_consent" | "unknown_script";

export type RecordingGateDeps = {
  readonly voices: VoiceRepo;
  readonly consents: ConsentRepo;
};

export const recordingGateFailure = async (
  { voices, consents }: RecordingGateDeps,
  { voiceId, userId }: { readonly voiceId: string; readonly userId: string },
  scriptIsKnown: boolean,
): Promise<RecordingGateFailure | null> => {
  if ((await voices.find(voiceId, userId)) === null) return "not_found";
  if (!(await consents.hasActive(voiceId, userId))) return "no_active_consent";
  return scriptIsKnown ? null : "unknown_script";
};
