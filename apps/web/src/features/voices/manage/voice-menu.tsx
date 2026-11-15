import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { useState } from "react";
import { useNavigate } from "react-router";

import { ActionSheet } from "../../../shared/ui/action-sheet";
import { DeleteDialog } from "../../../shared/ui/confirm-delete";
import { IconButton } from "../../../shared/ui/icon-button";
import { MoreIcon } from "../../../shared/ui/icons";
import { useDeleteVoice } from "./voice-actions";
import { voiceMenuActions } from "./voice-menu-actions";
import { voiceNamePath } from "../voice-paths";

type VoiceMenuProps = { readonly voice: VoiceResponse; readonly canBeDefault: boolean; readonly onToggleDefault: () => void };

// 이름 바꾸기·대표 정하기·지우기는 자주 쓰지 않아 ⋯ 하나 뒤에 둔다.
export const VoiceMenu = ({ voice, canBeDefault, onToggleDefault }: VoiceMenuProps) => {
  const navigate = useNavigate();
  const remove = useDeleteVoice(voice.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [askingDelete, setAskingDelete] = useState(false);
  const actions = voiceMenuActions(voice, canBeDefault, {
    rename: () => navigate(voiceNamePath(voice.id)),
    toggleDefault: onToggleDefault,
    askDelete: () => setAskingDelete(true),
  });
  return (
    <>
      <IconButton label="더 보기" onClick={() => setSheetOpen(true)}>
        <MoreIcon className="size-6" />
      </IconButton>
      <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={`${voice.label} 목소리`} actions={actions} />
      <DeleteDialog open={askingDelete} onClose={() => setAskingDelete(false)} title={`${voice.label} 목소리를 지울까요?`}
        body="이 목소리로 만든 동화도 함께 지워져요. 되돌릴 수 없어요." remove={remove} />
    </>
  );
};
