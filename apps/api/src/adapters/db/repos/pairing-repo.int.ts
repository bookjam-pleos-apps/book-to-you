import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectDatabase } from "../client";
import { devices, users } from "../schema";
import { createPairingRepo } from "./pairing-repo";

const connection = connectDatabase(process.env.DATABASE_URL ?? "");
const { database } = connection;

describe("pairing under real concurrency", () => {
  beforeAll(() => connection.migrate());
  afterAll(() => connection.close());

  it("creates one device when token polls race", async () => {
    const repo = createPairingRepo(database);
    const now = new Date();
    const unique = randomUUID();
    const [user] = await database.insert(users).values({ email: `${unique}@example.com` }).returning();
    if (!user) throw new Error("user not inserted");
    await repo.create({
      deviceCodeHash: unique,
      userCode: unique,
      deviceName: "차",
      expiresAt: new Date(now.getTime() + 60_000),
    });
    const pairing = await repo.findByDeviceCodeHash(unique);
    if (!pairing) throw new Error("pairing not found");
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        repo.consumeIntoDevice({
          pairingId: pairing.id,
          tokenHash: `${unique}-${index}`,
          userId: user.id,
          name: "차",
          scope: "library:read",
          now,
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await database.select().from(devices).where(eq(devices.userId, user.id))).toHaveLength(1);
  });
});
