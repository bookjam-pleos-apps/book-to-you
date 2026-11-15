import { and, count, eq, inArray, ne } from "drizzle-orm";

import { RENDERED_FAILURE_CODES } from "../../../domain/renders/retry-seed";
import type { Database } from "../client";
import { renders } from "../schema";
import { pairFilter } from "./render-columns";

// 워커와 운영자 배치가 같은 쌍의 실패를 같은 기준으로 세야 두 경로의 seed가 어긋나지 않는다.
export const renderedFailuresBefore = async (database: Database, renderId: string): Promise<number> => {
  const [row] = await database
    .select({ userId: renders.userId, voiceId: renders.voiceProfileId, storyId: renders.storyId })
    .from(renders)
    .where(eq(renders.id, renderId));
  if (row === undefined) return 0;
  const [failed] = await database
    .select({ total: count() })
    .from(renders)
    .where(
      and(
        pairFilter(row.userId, row.voiceId, row.storyId),
        eq(renders.status, "failed"),
        inArray(renders.errorCode, [...RENDERED_FAILURE_CODES]),
        ne(renders.id, renderId),
      ),
    );
  return failed?.total ?? 0;
};
