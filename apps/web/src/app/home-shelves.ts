import type { Render, VoiceResponse } from "@voice-storybook/shared/contracts/v1";

import { STORIES_PATH } from "../features/library/library-paths";
import { ownRenders, shelvesOf, type Shelf } from "../features/library/shelf";
import { readyVoices } from "../features/voices/manage/ready-voice-picker";
import { voiceTodo, type CardAction, type VoiceTodo } from "../features/voices/manage/voice-card-view";
import { NEW_VOICE_PATH } from "../features/voices/voice-paths";
import { showsDefault } from "../features/voices/manage/voice-rows";

// 홈은 목소리별 책장이다. 내 목소리 목록에 없는 목소리의 동화(지운 내 목소리, 시연 서버가 함께 보여 주는 동화)도
// 그 목소리 이름으로 선반을 두되 듣기만 한다(listenOnly).
export type HomeShelf = {
  readonly voiceId: string;
  readonly voiceLabel: string;
  // 듣기만 하는 선반은 목소리 화면으로 갈 수 없고 할 일도 없다.
  readonly listenOnly: boolean;
  // 목소리가 둘 이상일 때만 대표 목소리를 표시한다.
  readonly showsDefaultBadge: boolean;
  readonly renders: readonly Render[];
  readonly todo: VoiceTodo | null;
};

const voiceShelf = (voice: VoiceResponse, renders: readonly Render[], showDefault: boolean): HomeShelf => ({
  voiceId: voice.id,
  voiceLabel: voice.label,
  listenOnly: false,
  showsDefaultBadge: showDefault && voice.isDefault,
  renders: renders.filter((render) => render.voiceId === voice.id),
  todo: voiceTodo(voice),
});

const listenOnlyShelf = (shelf: Shelf): HomeShelf => ({ ...shelf, listenOnly: true, showsDefaultBadge: false, todo: null });

// 목소리는 서버가 준 순서, 지운 목소리의 선반은 그 뒤에 동화가 처음 나온 순서로 둔다.
export const homeShelvesOf = (voices: readonly VoiceResponse[], renders: readonly Render[]): readonly HomeShelf[] => {
  const known = new Set(voices.map((voice) => voice.id));
  const showDefault = showsDefault(voices.length);
  return [
    ...voices.map((voice) => voiceShelf(voice, renders, showDefault)),
    ...shelvesOf(renders.filter((render) => !known.has(render.voiceId))).map(listenOnlyShelf),
  ];
};

// 홈과 다음 할 일 안내가 같은 버튼을 쓴다.
export const MAKE_STORY: CardAction = { label: "동화 만들기", path: STORIES_PATH };

const FIRST_VOICE: CardAction = { label: "목소리 녹음하기", path: NEW_VOICE_PATH };

// 내 목소리도 내 동화도 없으면 첫 방문이다. 함께 보이는 시연 동화는 따지지 않는다.
export const isFirstVisit = (voices: readonly VoiceResponse[], renders: readonly Render[]): boolean =>
  voices.length === 0 && ownRenders(renders).length === 0;

// 홈의 주 버튼은 하나다. 녹음이 남은 목소리는 선반 알림이 맡으므로 그때는 주 버튼을 두지 않는다.
export const homePrimaryAction = (voices: readonly VoiceResponse[]): CardAction | null => {
  if (readyVoices(voices).length > 0) return MAKE_STORY;
  return voices.length === 0 ? FIRST_VOICE : null;
};

// 차 연결은 동화를 만들 수 있게 된 뒤에만 권한다. 차 목록을 받기 전이나 못 받았을 때는 알리지 않는다.
export const showsPairNotice = (voices: readonly VoiceResponse[], deviceCount: number | undefined): boolean =>
  deviceCount === 0 && readyVoices(voices).length > 0;
