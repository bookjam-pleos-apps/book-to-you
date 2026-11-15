import { and, count, desc, eq, gt, isNull, sql, sum } from "drizzle-orm";

import type { NewOtp, OtpRepo, OtpStore } from "../../../application/identity/ports";
import type { Database } from "../client";
import { otpCodes } from "../schema";

const sinceFilter = (email: string, since: Date) => and(eq(otpCodes.email, email), gt(otpCodes.createdAt, since));

const liveFilter = (email: string) => and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt));

const countRequestsSince = async (database: Database, email: string, since: Date): Promise<number> => {
  const [row] = await database.select({ total: count() }).from(otpCodes).where(sinceFilter(email, since));
  return row?.total ?? 0;
};

const sumFailuresSince = async (database: Database, email: string, since: Date): Promise<number> => {
  const [row] = await database.select({ total: sum(otpCodes.attempts) }).from(otpCodes).where(sinceFilter(email, since));
  return Number(row?.total ?? 0);
};

const findLive = async (database: Database, email: string) => {
  const [row] = await database
    .select()
    .from(otpCodes)
    .where(liveFilter(email))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  return row ?? null;
};

const insertOtp = async (database: Database, otp: NewOtp): Promise<void> => {
  await database.insert(otpCodes).values(otp);
};

const invalidateLive = async (database: Database, email: string, now: Date): Promise<void> => {
  await database.update(otpCodes).set({ consumedAt: now }).where(liveFilter(email));
};

const recordFailure = async (database: Database, id: string): Promise<void> => {
  await database
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(eq(otpCodes.id, id));
};

const markConsumed = async (database: Database, id: string, now: Date): Promise<void> => {
  await database.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, id));
};

const createOtpStore = (database: Database): OtpStore => ({
  countRequestsSince: (email, since) => countRequestsSince(database, email, since),
  sumFailuresSince: (email, since) => sumFailuresSince(database, email, since),
  invalidateLive: (email, now) => invalidateLive(database, email, now),
  insert: (otp) => insertOtp(database, otp),
  findLive: (email) => findLive(database, email),
  recordFailure: (id) => recordFailure(database, id),
  markConsumed: (id, now) => markConsumed(database, id, now),
});

export const createOtpRepo = (database: Database): OtpRepo => ({
  lockedByEmail: (email, work) =>
    database.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${email}))`);
      return work(createOtpStore(transaction));
    }),
});
