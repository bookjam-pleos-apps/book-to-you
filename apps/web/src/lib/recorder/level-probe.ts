import { peakOf } from "./input-level";

export type LevelProbe = {
  // 지금 입력 크기와 지금까지 가장 컸던 크기다. 재지 못하면 null이다.
  readonly read: () => { readonly current: number; readonly peak: number } | null;
  // 스트림을 잇고, 끊는 함수를 돌려준다. 갈아탄 마이크의 옛 입력을 끊는 데 쓴다.
  readonly attach: (stream: MediaStream) => () => void;
  readonly close: () => void;
  // 음량을 잴 수 있는 기기인가(AudioContext가 있는가). 없으면 마이크 점검을 하지 않는다.
  readonly canMeasure: boolean;
};

// 읽는 간격(200ms)보다 긴 창(48kHz에서 약 0.34초)을 잡아 읽기 사이 표본을 빠뜨리지 않는다.
// 창이 짧으면 말 사이사이만 읽혀 말소리가 있어도 무음으로 판정된다(가짜 마이크 신호음에서 확인).
const FFT_SIZE = 16_384;
// 막대는 최근 소리만 보여 준다(약 43ms).
const RECENT_SAMPLES = 2_048;

const NO_PROBE: LevelProbe = { read: () => null, attach: () => () => undefined, close: () => undefined, canMeasure: false };

// iOS Safari는 사용자 동작 안에서 만든 AudioContext만 돌린다. 그래서 녹음 버튼을 누른 순간 만들고, 스트림은 나중에 붙인다.
// 출력(destination)에는 잇지 않는다. 마이크가 열린 채 재생하면 iOS에서 소리가 깨진다(WebKit 326286).
export const openLevelProbe = (): LevelProbe => {
  if (typeof AudioContext === "undefined") return NO_PROBE;
  const context = new AudioContext();
  void context.resume().catch(() => undefined);
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  const buffer = new Float32Array(FFT_SIZE);
  const state = { peak: 0 };
  const read = () => {
    if (context.state !== "running") return null;
    analyser.getFloatTimeDomainData(buffer);
    state.peak = Math.max(state.peak, peakOf(buffer));
    return { current: peakOf(buffer.subarray(FFT_SIZE - RECENT_SAMPLES)), peak: state.peak };
  };
  const attach = (stream: MediaStream) => {
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    return () => source.disconnect();
  };
  return { read, attach, close: () => void context.close().catch(() => undefined), canMeasure: true };
};
