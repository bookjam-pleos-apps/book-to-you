// 마이크 입력 크기는 0(무음)~1(최대)이다. AnalyserNode의 시간 영역 표본에서 가장 큰 절댓값을 쓴다.
// -40 dBFS 아래면 말소리가 담기지 않은 것으로 본다. 서버 무음 자르기가 그 아래를 모두 잘라 too_short가 난다.
const SILENT_PEAK = 0.01;

const METER_STEPS = 5;

// 화면 막대는 dB 눈금으로 나눈다. 말소리 대부분이 -40~0 dBFS에 있다.
const METER_FLOOR_DB = -40;

export const peakOf = (samples: ArrayLike<number>): number =>
  Array.from(samples).reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);

// null은 음량을 재지 못한 경우다(iOS가 AudioContext를 멈춰 둔 경우 등). 모르는 것은 막지 않는다.
export const isSilentTake = (peak: number | null): boolean => peak !== null && peak < SILENT_PEAK;

export const meterStep = (peak: number): number => {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(Math.min(peak, 1));
  const ratio = (db - METER_FLOOR_DB) / -METER_FLOOR_DB;
  return Math.round(Math.min(1, Math.max(0, ratio)) * METER_STEPS);
};

export const METER_STEP_COUNT = METER_STEPS;
