import { deriveProgress, type StyleProgress } from "../../domain/voices/progress";
import type { VoiceChange } from "../../domain/voices/voice-change";
import type { VoiceRecord, VoiceRepo } from "./ports";

export type VoiceView = VoiceRecord & { readonly progress: readonly StyleProgress[] };

const toView = (voice: VoiceRecord): VoiceView => ({ ...voice, progress: deriveProgress(voice.clips) });

export const createVoice =
  ({ voices }: { readonly voices: VoiceRepo }) =>
  async (userId: string, label: string): Promise<VoiceView> => {
    const id = await voices.create(userId, label);
    return toView({ id, label, consent: null, consentRejected: false, isDefault: false, clips: [] });
  };

export const listVoices =
  ({ voices }: { readonly voices: VoiceRepo }) =>
  async (userId: string): Promise<readonly VoiceView[]> =>
    (await voices.list(userId)).map(toView);

export const getVoice =
  ({ voices }: { readonly voices: VoiceRepo }) =>
  async (voiceId: string, userId: string): Promise<VoiceView | null> => {
    const voice = await voices.find(voiceId, userId);
    return voice === null ? null : toView(voice);
  };

export type UpdateVoiceResult =
  | { readonly kind: "updated"; readonly voice: VoiceView }
  | { readonly kind: "not_found" | "no_active_consent" };

export const updateVoice =
  ({ voices }: { readonly voices: VoiceRepo }) =>
  async (voiceId: string, userId: string, change: VoiceChange): Promise<UpdateVoiceResult> => {
    const outcome = await voices.applyChange(voiceId, userId, change);
    return outcome.kind === "updated" ? { kind: "updated", voice: toView(outcome.voice) } : outcome;
  };
