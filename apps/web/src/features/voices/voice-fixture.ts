import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { STYLES } from "@voice-storybook/shared/vocab";

// 테스트에서만 쓰는 가짜 목소리다. 적지 않은 스타일은 녹음하지 않은(missing) 것으로 본다.
type Status = VoiceResponse["progress"][number]["status"];

export const voiceOf = (consent: VoiceResponse["consent"], statuses: Partial<Record<string, Status>>): VoiceResponse => ({
  id: "v1",
  label: "엄마",
  consent,
  consentRejected: false,
  isDefault: false,
  clips: [],
  progress: STYLES.map((style) => ({ style, status: statuses[style] ?? "missing" })),
});

export const REQUIRED_PASSED = { calm: "passed", excited: "passed", deep: "passed", child: "passed" } as const;
