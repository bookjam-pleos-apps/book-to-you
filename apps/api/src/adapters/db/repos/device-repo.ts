import { and, eq, isNull, lt, or } from "drizzle-orm";

import type { DeviceRepo } from "../../../application/devices/ports";
import type { Database } from "../client";
import { devices } from "../schema";

const recordSeen = async (database: Database, deviceId: string, now: Date, seenBefore: Date): Promise<void> => {
  await database
    .update(devices)
    .set({ lastSeenAt: now })
    .where(and(eq(devices.id, deviceId), or(isNull(devices.lastSeenAt), lt(devices.lastSeenAt, seenBefore))));
};

const revoke = async (database: Database, deviceId: string, userId: string, now: Date): Promise<boolean> => {
  const revoked = await database
    .update(devices)
    .set({ revokedAt: now })
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  return revoked.length === 1;
};

export const createDeviceRepo = (database: Database): DeviceRepo => ({
  findLiveByTokenHash: async (tokenHash) => {
    const [row] = await database
      .select({ deviceId: devices.id, userId: devices.userId })
      .from(devices)
      .where(and(eq(devices.tokenHash, tokenHash), isNull(devices.revokedAt)));
    return row ?? null;
  },
  recordSeen: (deviceId, now, seenBefore) => recordSeen(database, deviceId, now, seenBefore),
  listLive: (userId) =>
    database
      .select({ id: devices.id, name: devices.name, lastSeenAt: devices.lastSeenAt })
      .from(devices)
      .where(and(eq(devices.userId, userId), isNull(devices.revokedAt))),
  revoke: (deviceId, userId, now) => revoke(database, deviceId, userId, now),
});
