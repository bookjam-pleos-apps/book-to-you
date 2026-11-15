import type { MicProcessing } from "./recording-format";

// 처리를 끈 마이크가 살아 있는지 녹음 준비 중에 판정한다(삼성 폰은 처리를 끄면 무음이 됐다).
// 말소리가 아니라 소음 바닥으로 본다. 살아 있는 마이크는 조용한 방에서도 바닥 소음이 있어서, 부모가 읽기 전에 판정이 끝난다.
// -66 dBFS(0.0005)다. 이 아래만 나오면 죽은 마이크로 본다. 삼성 폰의 실제 값으로 맞춘 값이 아니다(검증 안 됨).
export const MIC_ALIVE_FLOOR = 0.0005;

// 마이크가 처음 소리를 내기까지 기기마다 조금 걸린다(Chromium 가짜 마이크는 약 0.55초). 이만큼 기다려도 바닥 아래면 죽었다고 본다.
// 짧게 잡아 살아 있는 마이크를 죽었다고 보면 처리를 켠 녹음이 될 뿐이라 여유를 둔다.
export const MIC_CHECK_LIMIT_MS = 1200;

export const MIC_CHECK_INTERVAL_MS = 50;

// alive: 처리를 끈 채 녹음을 이어 간다. dead: 처리를 켠 마이크로 갈아탄다.
// unknown: 음량을 잴 수 없다(iOS가 AudioContext를 멈춰 둔 경우 등). 모르는 것은 막지 않고 이어 간다. wait: 더 읽는다.
export type MicVerdict = "alive" | "dead" | "unknown" | "wait";

// peak는 마이크를 연 뒤 가장 컸던 입력이다. 재지 못하면 null이다.
export const micCheckVerdict = (peak: number | null, elapsedMs: number): MicVerdict => {
  const timedOut = elapsedMs >= MIC_CHECK_LIMIT_MS;
  if (peak === null) return timedOut ? "unknown" : "wait";
  if (peak >= MIC_ALIVE_FLOOR) return "alive";
  return timedOut ? "dead" : "wait";
};

// 점검 결과다. 녹음 결과(RecordedClip)와 콘솔에 남겨 실기기에서 바닥값을 맞출 때 쓴다.
export type MicCheckResult = { readonly verdict: Exclude<MicVerdict, "wait">; readonly peak: number | null; readonly afterMs: number };

// chrome://inspect 콘솔에서 찾기 쉽게 머리말을 붙인다. peak는 dBFS로도 적는다.
export const micCheckLine = ({ verdict, peak, afterMs }: MicCheckResult): string => {
  const level = peak === null ? "peak=null" : `peak=${peak.toFixed(5)} (${peak > 0 ? (20 * Math.log10(peak)).toFixed(1) : "-inf"} dBFS)`;
  return `[mic-check] ${verdict} ${level} after=${afterMs}ms`;
};

// 이미 처리를 켜기로 기억한 기기와 음량을 아예 잴 수 없는 기기(AudioContext 없음)는 점검 없이 바로 시작한다.
// 잴 수 없는 기기를 점검하면 녹음할 때마다 한도까지 기다리기만 한다.
export const needsMicCheck = (processing: MicProcessing, canMeasure: boolean): boolean => processing === "off" && canMeasure;

// 녹음이 끝났을 때의 한 줄이다. 점검은 살아 있다고 봤는데 녹음이 무음이면, 이 줄의 두 값으로 바닥값을 맞춘다.
export const takeLine = (takePeak: number | null, check: MicCheckResult | null): string =>
  `[mic-check] take peak=${takePeak === null ? "null" : takePeak.toFixed(5)} check=${check === null ? "none" : check.verdict}`;
