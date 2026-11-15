import { eq } from "drizzle-orm";

import type { Database } from "../client";
import { pendingPurges, voiceClips, voiceHandles } from "../schema";

// 음성 행을 잠근 트랜잭션 안에서 부른다. 객체와 엔진 핸들은 purge가 나중에 지운다.
export const removeClip = async (database: Database, clipId: string, storageKey: string): Promise<void> => {
  const handles = await database.select({ key: voiceHandles.key }).from(voiceHandles).where(eq(voiceHandles.clipId, clipId));
  await database.insert(pendingPurges).values({
    storagePrefix: storageKey,
    engineKeys: handles.map((handle) => handle.key),
  });
  await database.delete(voiceClips).where(eq(voiceClips.id, clipId));
};
