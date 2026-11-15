import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";

import { Chip, ChipGroup } from "../../../shared/ui/chip";
import { isVoiceReady } from "../voice-steps";

export const readyVoices = (voices: readonly VoiceResponse[]): readonly VoiceResponse[] => voices.filter(isVoiceReady);

// 준비된 목소리 중 처음 고를 것이다. 대표 목소리를, 없으면 첫 목소리를 고른다.
export const initialVoiceId = (ready: readonly VoiceResponse[]): string | undefined =>
  (ready.find((voice) => voice.isDefault) ?? ready[0])?.id;

type PickerProps = {
  // 이미 준비된 목소리만 받는다(readyVoices).
  readonly ready: readonly VoiceResponse[];
  readonly voiceId: string;
  readonly onPick: (voiceId: string) => void;
};

export const ReadyVoicePicker = ({ ready, voiceId, onPick }: PickerProps) => (
  <ChipGroup>
    {ready.map((voice) => (
      <Chip key={voice.id} selected={voice.id === voiceId} onClick={() => onPick(voice.id)}>
        {voice.label}
      </Chip>
    ))}
  </ChipGroup>
);
