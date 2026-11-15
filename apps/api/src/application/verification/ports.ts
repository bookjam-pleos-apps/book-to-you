import type { ClipAdvice, ClipFailure, Style } from "@voice-storybook/shared/vocab";

import type { Prosody } from "../../domain/voices/style-check";

export type ConsentAwaitingCheck = {
  readonly userId: string;
  readonly voiceId: string;
  readonly phrase: string;
};

// 확인 작업이 동의 행을 읽고 판정을 남기는 데 쓴다.
export interface ConsentCheckRepo {
  findChecking(consentId: string): Promise<ConsentAwaitingCheck | null>;
  activate(consentId: string, matchScore: number | null): Promise<boolean>;
  reject(consentId: string, now: Date): Promise<boolean>;
}

// 대본과 맞았던 녹음의 측정값이다.
export type ClipReading = {
  readonly errorRate: number;
  readonly prosody: Prosody;
};

// reading이 있으면 대본은 이미 통과했고 기준점(통과한 calm)을 기다리는 녹음이다. 다시 받아쓰지 않는다.
export type ClipAwaitingCheck = {
  readonly voiceId: string;
  readonly style: Style;
  readonly storageKey: string;
  readonly scriptId: string;
  readonly scriptVersion: string;
  readonly reading: ClipReading | null;
};

export type ClipVerdict = {
  readonly status: "passed" | "failed";
  readonly errorRate: number | null;
  readonly prosody: Prosody | null;
  readonly failure: ClipFailure | null;
  readonly advice: ClipAdvice | null;
};

// 통과한 calm 녹음이다. 이 검사가 생기기 전에 통과한 녹음은 prosody가 없다.
export type AnchorClip = {
  readonly id: string;
  readonly storageKey: string;
  readonly scriptId: string;
  readonly scriptVersion: string;
  readonly prosody: Prosody | null;
};

// 확인 작업이 녹음 행을 읽고 판정과 측정값을 남기는 데 쓴다.
export interface ClipCheckRepo {
  findChecking(clipId: string): Promise<ClipAwaitingCheck | null>;
  // 통과로 확정하면 같은 음성·같은 style의 앞선 통과 녹음을 함께 지운다. 새 녹음이나 앞선 녹음에 코칭이 붙었을 때만이다.
  settle(clipId: string, verdict: ClipVerdict): Promise<boolean>;
  recordReading(clipId: string, reading: ClipReading): Promise<void>;
  recordProsody(clipId: string, prosody: Prosody): Promise<void>;
  passedAnchors(voiceId: string): Promise<readonly AnchorClip[]>;
  idsAwaitingAnchor(voiceId: string): Promise<readonly string[]>;
}

// 아직 확인이 끝나지 않은 동의와 녹음이다.
export interface PendingChecks {
  listChecking(): Promise<{ readonly clipIds: readonly string[]; readonly consentIds: readonly string[] }>;
}
