import type { KeyValueStore } from "../browser/storage";
import type { MicProcessing } from "./recording-format";

const KEY = "voice-storybook.mic-processing";

// 이 기기에서 처리를 끈 녹음이 무음이었으면 기억해 두고, 다음 대본부터 처음부터 기본 처리로 연다.
// 기기의 성질이라 화면(단계)이 바뀌어도 유지한다. 처리를 끈 녹음이 되는 기기는 계속 "off"다.
export const readProcessing = (store: KeyValueStore | null): MicProcessing => {
  try {
    return store?.getItem(KEY) === "browser" ? "browser" : "off";
  } catch {
    return "off";
  }
};

export const rememberProcessing = (store: KeyValueStore | null, processing: MicProcessing): void => {
  try {
    store?.setItem(KEY, processing);
  } catch {
    // 사생활 보호 모드 등에서 저장이 막히면 이번 화면에서만 바꾼다.
  }
};
