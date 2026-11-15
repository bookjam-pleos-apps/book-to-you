import { hashSecretToken } from "../../domain/secret-token";
import type { Clock } from "../ports/clock";
import type { SessionRepo } from "./ports";

export type ResolveSessionDeps = {
  readonly sessions: SessionRepo;
  readonly clock: Clock;
};

export const resolveSession =
  ({ sessions, clock }: ResolveSessionDeps) =>
  (token: string): Promise<string | null> =>
    sessions.findLiveUserId(hashSecretToken(token), clock());
