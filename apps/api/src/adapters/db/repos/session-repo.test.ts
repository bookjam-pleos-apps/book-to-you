import { beforeEach, describe, expect, it } from "vitest";

import { sessions, users } from "../schema";
import { openTestDatabase, type TestDatabase } from "../testing/open-test-database";
import { createSessionRepo } from "./session-repo";

const NOW = new Date("2026-11-04T00:00:00Z");

describe("session repo", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await openTestDatabase();
    const [user] = await database.insert(users).values({ email: "a@example.com" }).returning();
    if (!user) throw new Error("user not inserted");
    await database.insert(sessions).values([
      { tokenHash: "live", userId: user.id, expiresAt: new Date(NOW.getTime() + 1000) },
      { tokenHash: "expired", userId: user.id, expiresAt: NOW },
    ]);
  });

  it("finds a live session and ignores an expired or unknown one", async () => {
    const repo = createSessionRepo(database);
    expect(await repo.findLiveUserId("live", NOW)).not.toBeNull();
    expect(await repo.findLiveUserId("expired", NOW)).toBeNull();
    expect(await repo.findLiveUserId("unknown", NOW)).toBeNull();
  });
});
