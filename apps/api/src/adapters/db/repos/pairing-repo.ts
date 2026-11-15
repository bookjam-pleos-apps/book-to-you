import { and, eq, gt, isNull } from "drizzle-orm";

import type { NewPairedDevice, PairingRepo } from "../../../application/devices/ports";
import type { Database } from "../client";
import { devicePairings, devices } from "../schema";

export const confirmPairingRow = async (database: Database, userCode: string, userId: string, now: Date): Promise<boolean> => {
  const confirmed = await database
    .update(devicePairings)
    .set({ userId, confirmedAt: now })
    .where(
      and(
        eq(devicePairings.userCode, userCode),
        isNull(devicePairings.confirmedAt),
        isNull(devicePairings.consumedAt),
        gt(devicePairings.expiresAt, now),
      ),
    )
    .returning({ id: devicePairings.id });
  return confirmed.length === 1;
};

// 조건부 UPDATE로 소비해 토큰이 한 번만 발급되게 한다.
const consumeIntoDevice = (database: Database, device: NewPairedDevice): Promise<boolean> =>
  database.transaction(async (transaction) => {
    const consumed = await transaction
      .update(devicePairings)
      .set({ consumedAt: device.now })
      .where(and(eq(devicePairings.id, device.pairingId), isNull(devicePairings.consumedAt)))
      .returning({ id: devicePairings.id });
    if (consumed.length !== 1) return false;
    const { tokenHash, userId, name, scope } = device;
    await transaction.insert(devices).values({ tokenHash, userId, name, scope });
    return true;
  });

export const createPairingRepo = (database: Database): PairingRepo => ({
  create: async (pairing) => {
    await database.insert(devicePairings).values(pairing);
  },
  confirm: (userCode, userId, now) => confirmPairingRow(database, userCode, userId, now),
  findByDeviceCodeHash: async (deviceCodeHash) => {
    const [row] = await database.select().from(devicePairings).where(eq(devicePairings.deviceCodeHash, deviceCodeHash));
    return row ?? null;
  },
  recordPoll: async (id, now) => {
    await database.update(devicePairings).set({ lastPolledAt: now }).where(eq(devicePairings.id, id));
  },
  consumeIntoDevice: (device) => consumeIntoDevice(database, device),
});
