import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { useCallback, useState } from "react";

import { sessionStore } from "../../../lib/browser/storage";
import { showsMicGuide } from "./mic-guide";
import { readGuideSeen, rememberGuideSeen } from "./mic-guide-seen";

// 낭독 확인 화면에 들어온 순간 한 번만 정한다. 녹음을 올려 상태가 바뀌어도 다시 띄우지 않는다.
// 닫을 때 이번 방문(탭)에서 봤다고 기억해, 녹음 흐름을 오가도 매번 보이지 않게 한다.
export const useMicGuide = (voice: VoiceResponse) => {
  const [open, setOpen] = useState(() => showsMicGuide(voice, readGuideSeen(sessionStore(), voice.id)));
  const close = useCallback(() => {
    rememberGuideSeen(sessionStore(), voice.id);
    setOpen(false);
  }, [voice.id]);
  return { open, close };
};
