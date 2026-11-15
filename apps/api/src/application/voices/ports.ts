import type { ClipAdvice, ClipFailure, PromptKind, Style } from "@voice-storybook/shared/vocab";

import type { ClipStatus } from "../../domain/voices/progress";
import type { SignalMeasurement } from "../../domain/voices/signal-qc";
import type { VoiceChange, VoiceChangeVerdict } from "../../domain/voices/voice-change";

export type LiveConsentStatus = "checking" | "active";

export type ClipSummary = {
  readonly id: string;
  readonly style: Style;
  readonly status: ClipStatus;
  readonly failure: ClipFailure | null;
  readonly advice: ClipAdvice | null;
};

export type VoiceRecord = {
  readonly id: string;
  readonly label: string;
  readonly consent: LiveConsentStatus | null;
  readonly consentRejected: boolean;
  readonly isDefault: boolean;
  readonly clips: readonly ClipSummary[];
};

export type VoiceChangeOutcome =
  | { readonly kind: "updated"; readonly voice: VoiceRecord }
  | { readonly kind: "not_found" | Exclude<VoiceChangeVerdict, "allowed"> };

export interface VoiceRepo {
  create(userId: string, label: string): Promise<string>;
  list(userId: string): Promise<readonly VoiceRecord[]>;
  find(voiceId: string, userId: string): Promise<VoiceRecord | null>;
  applyChange(voiceId: string, userId: string, change: VoiceChange): Promise<VoiceChangeOutcome>;
}

export type NewConsent = {
  readonly id: string;
  readonly userId: string;
  readonly voiceId: string;
  readonly speakerLabel: string;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
  readonly phrase: string;
  readonly phraseAudioSha256: string;
  readonly givenAt: Date;
};

export type ConsentInsertion = "inserted" | "voice_gone" | "already_live";

export interface ConsentRepo {
  hasActive(voiceId: string, userId: string): Promise<boolean>;
  insertChecking(consent: NewConsent): Promise<ConsentInsertion>;
}

export type NewClip = {
  readonly id: string;
  readonly userId: string;
  readonly voiceId: string;
  readonly style: Style;
  readonly scriptId: string;
  readonly scriptVersion: string;
  readonly storageKey: string;
  readonly sha256: string;
  readonly durationMs: number;
  readonly signal: SignalMeasurement;
};

export interface ClipRepo {
  insertIfConsentActive(clip: NewClip): Promise<boolean>;
}

export interface VoiceDeletionRepo {
  deleteVoice(voiceId: string, userId: string, now: Date): Promise<boolean>;
  deleteClip(clipId: string, voiceId: string, userId: string): Promise<boolean>;
}

export type NewPrompt = {
  readonly id: string;
  readonly userId: string;
  readonly voiceId: string;
  readonly kind: PromptKind;
  readonly scriptId: string;
  readonly scriptVersion: string;
  readonly storageKey: string;
  readonly sha256: string;
  readonly durationMs: number;
  readonly bytes: number;
  readonly signal: SignalMeasurement;
};

export type PromptReplacement = "inserted" | "replaced" | "consent_inactive";

export interface PromptRepo {
  replaceIfConsentActive(prompt: NewPrompt): Promise<PromptReplacement>;
}
