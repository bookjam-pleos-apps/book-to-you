import { eq } from "drizzle-orm";

import type { AccountRepo, NewAccount } from "../../../application/identity/ports";
import type { Database } from "../client";
import { consentRecords, users } from "../schema";

const findOrCreateUserId = async (database: Database, email: string): Promise<string> => {
  const [created] = await database
    .insert(users)
    .values({ email })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (created !== undefined) return created.id;
  const [existing] = await database.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing === undefined) throw new Error("user vanished during registration");
  return existing.id;
};

// 약관이 개정되면 기존 사용자도 새 버전으로 로그인하므로, 사용자·버전마다 영수증을 하나씩 남긴다.
export const recordTermsReceipt = async (database: Database, userId: string, account: NewAccount): Promise<void> => {
  await database
    .insert(consentRecords)
    .values({
      kind: "account_terms",
      userId,
      termsVersion: account.termsVersion,
      aiNoticeVersion: account.aiNoticeVersion,
      status: "active",
      givenAt: account.now,
    })
    .onConflictDoNothing();
};

export const createAccountRepo = (database: Database): AccountRepo => ({
  findOrRegister: (account) =>
    database.transaction(async (transaction) => {
      const userId = await findOrCreateUserId(transaction, account.email);
      await recordTermsReceipt(transaction, userId, account);
      return userId;
    }),
  find: async (userId) => {
    const [row] = await database.select().from(users).where(eq(users.id, userId));
    return row ?? null;
  },
});
