import type { KeyValueStore } from "../../../lib/browser/storage";

// 이번 방문(탭)에서 목소리마다 안내를 봤는지 기억한다. 저장소는 sessionStorage다.
const seenKey = (voiceId: string): string => `voice-storybook.mic-guide-seen.${voiceId}`;

export const readGuideSeen = (store: KeyValueStore | null, voiceId: string): boolean => {
  try {
    return store?.getItem(seenKey(voiceId)) === "1";
  } catch {
    return false;
  }
};

export const rememberGuideSeen = (store: KeyValueStore | null, voiceId: string): void => {
  try {
    store?.setItem(seenKey(voiceId), "1");
  } catch {
    // 저장이 막히면 다음에 한 번 더 보일 뿐이다.
  }
};
