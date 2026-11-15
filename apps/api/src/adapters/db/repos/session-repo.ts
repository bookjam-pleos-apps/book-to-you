import { and, eq, gt } from "drizzle-orm";

import type { SessionRepo } from "../../../application/identity/ports";
import type { Database } from "../client";
import { sessions } from "../schema";

export const createSessionRepo = (database: Database): SessionRepo => ({
  findLiveUserId: async (tokenHash, now) => {
    const [row] = await database
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
    return row?.userId ?? null;
  },
  create: async (session) => {
    await database.insert(sessions).values(session);
  },
  delete: async (tokenHash) => {
    await database.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  },
});
