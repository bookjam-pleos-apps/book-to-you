import type { ClipAnalysis, ClipAnalyzer } from "../application/ports/clip-analyzer";
import type { VoiceMeasure } from "../domain/voices/style-check";

export const CALM_MEASURE: VoiceMeasure = { voicedSeconds: 12, medianSemitones: 93 };

export const semitonesFromCalm = (shift: number): VoiceMeasure => ({
  ...CALM_MEASURE,
  medianSemitones: (CALM_MEASURE.medianSemitones ?? 0) + shift,
});

export type CountingAnalyzer = ClipAnalyzer & { readonly calls: () => number };

// 받아쓰기와 측정값을 정해 준 대로 돌려준다. Error를 주면 분석 서비스가 내려간 것처럼 실패한다.
export const analyzerSaying = (transcript: string | Error, measure: VoiceMeasure = CALM_MEASURE): CountingAnalyzer => {
  const counter = { calls: 0 };
  const analyze = (): Promise<ClipAnalysis> => {
    counter.calls += 1;
    return transcript instanceof Error ? Promise.reject(transcript) : Promise.resolve({ transcript, measure });
  };
  return { analyze, calls: () => counter.calls };
};
