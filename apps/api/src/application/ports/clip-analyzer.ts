import type { VoiceMeasure } from "../../domain/voices/style-check";

export type ClipAnalysis = {
  readonly transcript: string;
  readonly measure: VoiceMeasure;
};

// 녹음 하나를 받아쓰고 음높이와 말한 시간을 잰다. 판정은 하지 않는다.
export interface ClipAnalyzer {
  analyze(wav: Uint8Array): Promise<ClipAnalysis>;
}

export class ClipAnalyzerUnavailable extends Error {
  override readonly name = "ClipAnalyzerUnavailable";
}
