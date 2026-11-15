// 같은 목소리로 같은 이야기를 다시 렌더하면(원고·참조·조립 규칙이 바뀔 때) 성공한 렌더가 여럿 남는다.
// 차량 책장과 시연 묶음에는 그중 가장 최근에 끝난 것 하나만 보인다.
export type RenderVersion = {
  readonly id: string;
  readonly voiceId: string;
  readonly storyId: string;
  readonly finishedAt: Date | null;
};

const finishedMs = (render: RenderVersion): number => render.finishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

const sameStory = (left: RenderVersion, right: RenderVersion): boolean =>
  left.voiceId === right.voiceId && left.storyId === right.storyId;

// 끝난 시각이 같거나 없으면 id로 정해, 요청마다 다른 렌더가 보이지 않게 한다.
const isNewer = (candidate: RenderVersion, current: RenderVersion): boolean =>
  finishedMs(candidate) > finishedMs(current) || (finishedMs(candidate) === finishedMs(current) && candidate.id > current.id);

export const latestRenderIds = (renders: readonly RenderVersion[]): ReadonlySet<string> =>
  new Set(renders.filter((render) => !renders.some((other) => sameStory(other, render) && isNewer(other, render))).map(({ id }) => id));
