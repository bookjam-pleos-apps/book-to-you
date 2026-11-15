import type { Render, VoiceResponse } from "@voice-storybook/shared/contracts/v1";

import { ownRenders } from "../features/library/shelf";
import { readyVoices } from "../features/voices/manage/ready-voice-picker";
import { nextVoiceAction, voiceTodo, type CardAction } from "../features/voices/manage/voice-card-view";
import { recordStepPath } from "../features/voices/voice-paths";
import { optionalStyleToOffer } from "../features/voices/voice-steps";
import { CHECKING_TEXT, remainingRecordingText } from "../features/voices/manage/voice-todo-text";
import { HOME_PATH } from "../shared/routing/return-path";
import { MAKE_STORY } from "./home-shelves";

// extra는 주 버튼 아래에 두는 보조 버튼이다. 하지 않아도 되는 일만 넣는다.
export type NextStep = { readonly body: string; readonly action: CardAction; readonly extra?: CardAction };

const HOME: CardAction = { label: "홈으로", path: HOME_PATH };


// 차를 연결한 뒤 할 일이다. 바로 시작하기로 온 부모는 목소리가 없고, 동화가 없으면 차 책장은 비어 있다.
export const afterPairing = (voices: readonly VoiceResponse[], renders: readonly Render[]): NextStep => {
  if (readyVoices(voices).length === 0) {
    const action = nextVoiceAction(voices);
    if (action === null) return { body: "목소리를 확인하고 있어요. 확인이 끝나면 동화를 만들 수 있어요.", action: HOME };
    return { body: "목소리를 녹음하면 동화를 만들어 차에서 들을 수 있어요.", action };
  }
  if (ownRenders(renders).length === 0) return { body: "동화를 만들면 차 화면에 보여요.", action: MAKE_STORY };
  return { body: "차 화면에 동화가 보이면 끝이에요. 처음에는 받느라 조금 걸릴 수 있어요.", action: HOME };
};

const SOFT_OFFER_LABEL = "속삭이는 장면도 내 목소리로 (1분)";

// 아직 하지 않은 작은 목소리 녹음만 권한다. 녹음을 마치면 이 완료 화면으로 돌아와 동화 만들기를 잇는다.
const softRecording = (voice: VoiceResponse): Pick<NextStep, "extra"> =>
  optionalStyleToOffer(voice) === "soft" ? { extra: { label: SOFT_OFFER_LABEL, path: recordStepPath(voice.id, "soft") } } : {};

// 녹음 흐름을 마친 직후 할 일이다. 주 버튼은 하나만 둔다. 선택 녹음은 준비를 마쳤을 때만 그 아래에 권한다.
export const afterRecording = (voice: VoiceResponse): NextStep => {
  const todo = voiceTodo(voice);
  if (todo === null) return { body: `이제 ${voice.label} 목소리로 동화를 만들 수 있어요.`, action: MAKE_STORY, ...softRecording(voice) };
  if (todo.kind === "checking") return { body: CHECKING_TEXT[todo.next], action: HOME };
  return { body: `${remainingRecordingText(todo.remaining)}.`, action: { label: "이어서 녹음하기", path: todo.path } };
};
