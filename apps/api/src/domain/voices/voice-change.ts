export type VoiceChange = {
  readonly label?: string | undefined;
  readonly isDefault?: boolean | undefined;
};

export const isEmptyVoiceChange = (change: VoiceChange): boolean => change.label === undefined && change.isDefault === undefined;

export type VoiceChangeVerdict = "allowed" | "no_active_consent";

// 대표 목소리는 차량이 처음 고를 목소리라서, 지금 재생할 수 있는(동의가 활성인) 목소리만 될 수 있다.
export const judgeVoiceChange = (change: VoiceChange, hasActiveConsent: boolean): VoiceChangeVerdict =>
  change.isDefault === true && !hasActiveConsent ? "no_active_consent" : "allowed";
