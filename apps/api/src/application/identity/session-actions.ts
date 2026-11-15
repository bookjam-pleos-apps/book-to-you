import { hashSecretToken } from "../../domain/secret-token";
import type { Clock } from "../ports/clock";
import { requestPurge, type JobQueue } from "../ports/job-queue";
import type { Account, AccountDeletionRepo, AccountRepo, SessionRepo } from "./ports";

export const logout =
  ({ sessions }: { readonly sessions: SessionRepo }) =>
  (token: string): Promise<void> =>
    sessions.delete(hashSecretToken(token));

export const getAccount =
  ({ accounts }: { readonly accounts: AccountRepo }) =>
  (userId: string): Promise<Account | null> =>
    accounts.find(userId);

export type DeleteAccountDeps = {
  readonly deletion: AccountDeletionRepo;
  readonly queue: JobQueue;
  readonly clock: Clock;
};

export const deleteAccount =
  ({ deletion, queue, clock }: DeleteAccountDeps) =>
  async (userId: string): Promise<boolean> => {
    const deleted = await deletion.deleteAccount(userId, clock());
    if (deleted) await requestPurge(queue);
    return deleted;
  };
