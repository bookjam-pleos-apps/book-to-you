import type { Style } from "@voice-storybook/shared/vocab";

// 다른 style이 구별되어야 하는 기준점이다. spike의 ANCHOR_STYLE과 같다.
export const ANCHOR_STYLE: Style = "calm";

export const STYLE_METRICS = ["pitchShiftSemitones", "speechRateChange"] as const;

export type StyleMetric = (typeof STYLE_METRICS)[number];

// calm 대비 변화량의 한쪽 경계다.
export type StyleBound =
  | { readonly metric: StyleMetric; readonly atLeast: number }
  | { readonly metric: StyleMetric; readonly atMost: number };

// anyOf 중 하나만 맞으면 calm과 구별된 것으로 본다. spike의 style_problems와 같은 규칙이다.
export type StyleCheck = {
  readonly style: Style;
  readonly anyOf: readonly StyleBound[];
};

// 측정 서비스가 돌려주는 값이다. voicedSeconds는 앞뒤 무음을 뺀 길이다.
export type VoiceMeasure = {
  readonly voicedSeconds: number;
  readonly medianSemitones: number | null;
};

export type Prosody = {
  readonly medianSemitones: number | null;
  readonly speechRate: number | null;
};

export const prosodyOf = ({ voicedSeconds, medianSemitones }: VoiceMeasure, syllables: number): Prosody => ({
  medianSemitones,
  speechRate: voicedSeconds > 0 ? syllables / voicedSeconds : null,
});

const pitchShiftSemitones = (calm: Prosody, clip: Prosody): number | null =>
  calm.medianSemitones === null || clip.medianSemitones === null ? null : clip.medianSemitones - calm.medianSemitones;

// calm보다 느리면 음수다. −0.05는 5% 느리다는 뜻이다.
const speechRateChange = (calm: Prosody, clip: Prosody): number | null =>
  calm.speechRate === null || calm.speechRate === 0 || clip.speechRate === null ? null : clip.speechRate / calm.speechRate - 1;

const CHANGES: Record<StyleMetric, (calm: Prosody, clip: Prosody) => number | null> = { pitchShiftSemitones, speechRateChange };

// 잴 수 없는 값은 통과 근거로 쓰지 않는다.
const meets = (bound: StyleBound, calm: Prosody, clip: Prosody): boolean => {
  const change = CHANGES[bound.metric](calm, clip);
  if (change === null) return false;
  return "atLeast" in bound ? change >= bound.atLeast : change <= bound.atMost;
};

export const isDistinctFrom = (check: StyleCheck, calm: Prosody, clip: Prosody): boolean =>
  check.anyOf.some((bound) => meets(bound, calm, clip));

// 통과한 calm이 여럿이면 어느 것이 참조로 쓰일지 모른다. 추측하지 않고 모두와 구별되어야 통과다.
export const isDistinctFromEvery = (check: StyleCheck, calms: readonly Prosody[], clip: Prosody): boolean =>
  calms.every((calm) => isDistinctFrom(check, calm, clip));
