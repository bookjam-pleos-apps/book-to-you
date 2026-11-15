import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";

import type { SheetAction } from "../../../shared/ui/action-sheet";

export type VoiceMenuHandlers = {
  readonly rename: () => void;
  readonly toggleDefault: () => void;
  readonly askDelete: () => void;
};

const defaultAction = (voice: VoiceResponse, toggleDefault: () => void): SheetAction => ({
  label: voice.isDefault ? "대표 목소리에서 빼기" : "대표 목소리로 정하기",
  onSelect: toggleDefault,
});

// ⋯ 시트 항목이다. 대표는 고를 수 있을 때만 넣고, 되돌릴 수 없는 지우기는 맨 아래 빨간 글자로 둔다.
export const voiceMenuActions = (voice: VoiceResponse, canBeDefault: boolean, handlers: VoiceMenuHandlers): readonly SheetAction[] => [
  { label: "이름 바꾸기", onSelect: handlers.rename },
  ...(canBeDefault ? [defaultAction(voice, handlers.toggleDefault)] : []),
  { label: "목소리 지우기", onSelect: handlers.askDelete, tone: "danger" },
];
