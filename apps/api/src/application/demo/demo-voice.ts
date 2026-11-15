import type { VoiceRecord, VoiceRepo } from "../voices";

export type DemoVoiceLookup = { readonly kind: "found"; readonly voice: VoiceRecord } | { readonly kind: "no_single_voice"; readonly voices: number };

// 데모 계정은 목소리 하나를 전제로 한다. 여럿이면 어느 목소리에 붙일지 운영자가 먼저 정리한다.
export const findDemoVoice = async (voices: Pick<VoiceRepo, "list">, userId: string): Promise<DemoVoiceLookup> => {
  const found = await voices.list(userId);
  const voice = found.length === 1 ? found[0] : undefined;
  return voice === undefined ? { kind: "no_single_voice", voices: found.length } : { kind: "found", voice };
};
