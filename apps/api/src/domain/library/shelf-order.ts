import { compareText } from "../compare-text";

type ShelfEntry = { readonly voiceId: string; readonly voiceLabel: string; readonly storyId: string };

const rankOf = (entry: ShelfEntry, defaultVoiceId: string | null): number => (entry.voiceId === defaultVoiceId ? 0 : 1);

// 차량은 목소리가 처음 나온 순서로 책장을 쌓는다. 대표 목소리를 맨 앞에 두면 차량 앱을 바꾸지 않아도 대표 책장이 먼저 보인다.
// 나머지는 부모가 붙인 이름 순서다(완성형 한글은 코드 순서가 가나다 순서다). 이름이 같으면 id로 갈라 책장이 섞이지 않게 한다.
export const orderShelf = <Entry extends ShelfEntry>(entries: readonly Entry[], defaultVoiceId: string | null): readonly Entry[] =>
  [...entries].sort(
    (left, right) =>
      rankOf(left, defaultVoiceId) - rankOf(right, defaultVoiceId) ||
      compareText(left.voiceLabel, right.voiceLabel) ||
      compareText(left.voiceId, right.voiceId) ||
      compareText(left.storyId, right.storyId),
  );
