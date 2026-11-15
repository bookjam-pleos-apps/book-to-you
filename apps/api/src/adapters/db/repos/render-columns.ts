import { and, eq } from "drizzle-orm";

import type { NewRender } from "../../../application/renders/ports";
import { renders } from "../schema";

// 한 사용자의 목소리와 이야기 한 쌍이다. 화면의 한 줄, 실패 횟수, 대기 행 찾기가 모두 이 조건을 쓴다.
export const pairFilter = (userId: string, voiceId: string, storyId: string) =>
  and(eq(renders.userId, userId), eq(renders.voiceProfileId, voiceId), eq(renders.storyId, storyId));

// 대기 행을 지금 계획으로 바꿀 때 덮어쓰는 칸이다. 운영자 배치와 렌더 워커가 같은 칸을 바꿔야 키가 어긋나지 않는다.
export const planColumnsOf = ({ storyVersion, renderKey, refClipIds, engineId, engineVersion, chaptersTotal }: NewRender) => ({
  storyVersion,
  renderKey,
  refClipIds: [...refClipIds],
  engineId,
  engineVersion,
  chaptersTotal,
});
