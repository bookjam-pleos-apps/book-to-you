export type SignalMeasurement = {
  readonly clippedRatio: number;
  readonly noiseFloorDb: number;
  readonly peakDb: number;
};

export type DurationLimits = {
  readonly minMs: number;
  readonly maxMs: number;
};

export type SignalLimits = {
  readonly maxClippedRatio: number;
  readonly maxNoiseFloorDb: number;
  readonly minPeakDb: number;
};

export type SignalRejection = "too_short" | "too_long" | "clipped" | "too_noisy" | "too_quiet";

const FULL_SCALE = 32768;
const CLIPPED_SAMPLE = 32734;
const SILENCE_DB = -120;
const WINDOW_SEC = 0.05;
const NOISE_PERCENTILE = 0.1;

const toDb = (linear: number): number => (linear <= 0 ? SILENCE_DB : Math.max(20 * Math.log10(linear), SILENCE_DB));

const rmsDb = (samples: Int16Array): number => {
  const energy = samples.reduce((total, sample) => total + sample * sample, 0);
  return toDb(Math.sqrt(energy / samples.length) / FULL_SCALE);
};

const noiseFloorDb = (samples: Int16Array, sampleRate: number): number => {
  const windowSize = Math.floor(sampleRate * WINDOW_SEC);
  const windowCount = Math.floor(samples.length / windowSize);
  const levels = Array.from({ length: windowCount }, (_, index) =>
    rmsDb(samples.subarray(index * windowSize, (index + 1) * windowSize)),
  ).toSorted((a, b) => a - b);
  return levels[Math.floor(levels.length * NOISE_PERCENTILE)] ?? SILENCE_DB;
};

export const measureSignal = (samples: Int16Array, sampleRate: number): SignalMeasurement => {
  const clipped = samples.reduce((total, sample) => total + (Math.abs(sample) >= CLIPPED_SAMPLE ? 1 : 0), 0);
  const peak = samples.reduce((highest, sample) => Math.max(highest, Math.abs(sample)), 0);
  return {
    clippedRatio: samples.length === 0 ? 0 : clipped / samples.length,
    noiseFloorDb: noiseFloorDb(samples, sampleRate),
    peakDb: toDb(peak / FULL_SCALE),
  };
};

export const judgeSignal = (
  signal: SignalMeasurement,
  durationMs: number,
  duration: DurationLimits,
  limits: SignalLimits,
): readonly SignalRejection[] => {
  const checks: readonly (readonly [SignalRejection, boolean])[] = [
    ["too_short", durationMs < duration.minMs],
    ["too_long", durationMs > duration.maxMs],
    ["clipped", signal.clippedRatio > limits.maxClippedRatio],
    ["too_noisy", signal.noiseFloorDb > limits.maxNoiseFloorDb],
    ["too_quiet", signal.peakDb < limits.minPeakDb],
  ];
  return checks.filter(([, failed]) => failed).map(([rejection]) => rejection);
};
