import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";

// 브라우저 API를 쓰지 않는다. 루트 parity 테스트(DOM 타입 없음)가 이 파일의 상수를 읽는다.
// 마이크 거리 안내는 4.5초 동안 한 번 움직이고 0.3초에 걸쳐 사라진다.
// 움직임의 장면 시각은 mic-guide.css의 키프레임에 있다. 두 길이는 거기의 --mic-guide-play, --mic-guide-fade와 같아야 한다(parity 테스트).
export const MIC_GUIDE_PLAY_MS = 4500;

export const MIC_GUIDE_FADE_MS = 300;

export type GuidePhase = "playing" | "fading" | "closed";

// 각 단계가 얼마나 머무는지와 다음 단계다. 닫힌 뒤에는 다음이 없다.
export const nextGuidePhase = (phase: GuidePhase): { readonly after: number; readonly next: GuidePhase } | null => {
  if (phase === "playing") return { after: MIC_GUIDE_PLAY_MS, next: "fading" };
  return phase === "fading" ? { after: MIC_GUIDE_FADE_MS, next: "closed" } : null;
};

// 목소리마다 첫 녹음(낭독 확인) 직전에 보인다. 녹음하는 사람이 목소리마다 다를 수 있어서다.
// 같은 방문(탭)에서 이미 봤으면 다시 띄우지 않는다. 다만 낭독 확인을 거절당했으면 원인이 잡음일 수 있어 다시 보인다.
export const showsMicGuide = (voice: VoiceResponse, seenThisVisit: boolean): boolean =>
  voice.consent === "none" && (!seenThisVisit || voice.consentRejected);
