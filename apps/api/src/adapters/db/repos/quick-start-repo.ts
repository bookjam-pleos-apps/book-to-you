import type { QuickStartAccount, QuickStartRepo } from "../../../application/devices/ports";
import type { Database } from "../client";
import { users } from "../schema";
import { recordTermsReceipt } from "./account-repo";
import { confirmPairingRow } from "./pairing-repo";

class CodeNotLive extends Error {}

const register = async (database: Database, account: QuickStartAccount): Promise<string> => {
  const [created] = await database.insert(users).values({ email: account.email }).returning({ id: users.id });
  if (created === undefined) throw new Error("quick start user was not created");
  await recordTermsReceipt(database, created.id, account);
  return created.id;
};

// 코드가 만료됐거나 이미 쓰였으면 예외로 트랜잭션을 되돌려 빈 계정이 남지 않게 한다.
const registerAndConfirm = async (database: Database, account: QuickStartAccount): Promise<string | null> => {
  try {
    return await database.transaction(async (transaction) => {
      const userId = await register(transaction, account);
      if (!(await confirmPairingRow(transaction, account.userCode, userId, account.now))) throw new CodeNotLive();
      return userId;
    });
  } catch (error) {
    if (error instanceof CodeNotLive) return null;
    throw error;
  }
};

export const createQuickStartRepo = (database: Database): QuickStartRepo => ({
  registerAndConfirm: (account) => registerAndConfirm(database, account),
});
