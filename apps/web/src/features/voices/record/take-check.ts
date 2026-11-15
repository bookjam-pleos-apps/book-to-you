import { isSilentTake } from "../../../lib/recorder/input-level";
import type { RecordedClip } from "../../../lib/recorder/recorder-state";
import type { Feedback } from "./recording-feedback";
import { durationHint, isTooShort, type RecordingKind } from "./recording-limits";

// 안드로이드(삼성)에서 처리를 끈 녹음만 무음이었고, 기본 처리로 다시 열자 정상이었다.
// 그래서 처리를 끈 녹음이 무음이면 다시 녹음을 이끈다. 다음 녹음은 기본 처리로 자동으로 열린다.
export const RETRY_WITH_DEFAULT_FEEDBACK: Feedback = {
  title: "소리가 녹음되지 않았어요",
  body: "다시 녹음해 주세요. 이번에는 다른 방식으로 녹음해 볼게요.",
};

// 기본 처리로도 무음이면 그때는 기기 마이크나 권한을 의심한다.
export const SILENT_TAKE_FEEDBACK: Feedback = {
  title: "소리가 들리지 않아요",
  body: "휴대폰 마이크가 켜져 있는지 확인해 주세요. 안드로이드는 빠른 설정의 '마이크 액세스'와 브라우저의 사이트 권한을 봐 주세요.",
};

// 올리기 전에 막을 녹음인지 본다. 무음을 먼저 본다. 무음은 서버가 잘라 내 결국 too_short로 보이기 때문이다.
export const takeProblem = (kind: RecordingKind, clip: RecordedClip): Feedback | null => {
  if (isSilentTake(clip.peak)) return clip.processing === "off" ? RETRY_WITH_DEFAULT_FEEDBACK : SILENT_TAKE_FEEDBACK;
  if (isTooShort(kind, clip.durationMs)) return { title: "조금 짧아요", body: durationHint(kind) };
  return null;
};
