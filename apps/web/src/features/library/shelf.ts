import type { Render, RenderDetail, RenderStatus } from "@voice-storybook/shared/contracts/v1";

// 실제 렌더 시간(e2e 약 8분)이다. 남은 시간을 재지 않고 한 번만 알린다.
export const MAKING_MINUTES = 8;

const KEEPS_MAKING = "닫아도 계속 만들어요.";

export const MAKING_NOTICE = `만드는 데 ${MAKING_MINUTES}분쯤 걸려요. ${KEEPS_MAKING}`;

export const STATUS_TEXT: Record<RenderStatus, string> = {
  making: `만드는 중 · ${MAKING_MINUTES}분쯤`,
  playable: "다 만들었어요",
  failed: "만들지 못했어요",
};

// 책장 표지 아래에는 이상할 때만 짧게 적는다. 남은 시간은 만들기 화면에서 한 번만 알린다.
export const BOOK_STATE_TEXT: Readonly<Record<Exclude<RenderStatus, "playable">, string>> = {
  making: "만드는 중 · 닫아도 돼요",
  failed: "만들지 못했어요",
};

export const MAKING_LEAVE_NOTICE = { title: "동화를 만들고 있어요", body: `${KEEPS_MAKING} 다 되면 차 책장에도 생겨요.` } as const;

export type BookTap = { readonly kind: "open"; readonly renderId: string } | { readonly kind: "notice" };

// 만드는 중인 책은 아직 들을 수 없다. 눌러도 반응이 없으면 멈춘 것처럼 보여 떠나도 된다고 알린다.
export const bookTapOf = (render: Pick<Render, "status" | "renderId">): BookTap =>
  render.status === "making" ? { kind: "notice" } : { kind: "open", renderId: render.renderId };

export type Shelf = { readonly voiceId: string; readonly voiceLabel: string; readonly renders: readonly Render[] };

// 시연 서버가 함께 보여 주는 동화(shared)를 뺀 내 동화다.
export const ownRenders = (renders: readonly Render[]): readonly Render[] => renders.filter((render) => !render.shared);

export const hasMaking = (renders: readonly Render[]): boolean => renders.some((render) => render.status === "making");

const voiceIdsInOrder = (renders: readonly Render[]): readonly string[] => [...new Set(renders.map((render) => render.voiceId))];

const shelfOf = (renders: readonly Render[], voiceId: string): Shelf => {
  const mine = renders.filter((render) => render.voiceId === voiceId);
  return { voiceId, voiceLabel: mine[0]?.voiceLabel ?? "", renders: mine };
};

// 차량 책장과 같게 목소리가 처음 나온 순서로 묶는다.
export const shelvesOf = (renders: readonly Render[]): readonly Shelf[] =>
  voiceIdsInOrder(renders).map((voiceId) => shelfOf(renders, voiceId));

export const renderOf = (renders: readonly Render[], storyId: string, voiceId: string): Render | undefined =>
  renders.find((render) => render.storyId === storyId && render.voiceId === voiceId);

// 고른 목소리로 이미 만들었거나 만드는 중인 동화는 다시 만들지 않는다. 실패한 것만 다시 만들 수 있다.
export const canMake = (status: RenderStatus | null): boolean => status === null || status === "failed";

// 서버가 정한 순서를 믿지 않고 장 번호로 줄 세운다. 차량 앱도 index로 이어 듣는다.
export const chaptersInOrder = (render: RenderDetail): RenderDetail["chapters"] => render.chapters.toSorted((left, right) => left.index - right.index);
