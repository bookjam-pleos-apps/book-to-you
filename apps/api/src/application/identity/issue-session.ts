import { randomBytes } from "node:crypto";

import { createSecretToken, hashSecretToken } from "../../domain/secret-token";
import type { SessionRepo } from "./ports";

export type IssueSessionDeps = {
  readonly sessions: SessionRepo;
  readonly sessionTtlMs: number;
};

export type IssuedSession = {
  readonly sessionToken: string;
  readonly maxAgeSec: number;
};

export const issueSession = async (deps: IssueSessionDeps, userId: string, now: Date): Promise<IssuedSession> => {
  const sessionToken = createSecretToken(randomBytes);
  const expiresAt = new Date(now.getTime() + deps.sessionTtlMs);
  await deps.sessions.create({ tokenHash: hashSecretToken(sessionToken), userId, expiresAt });
  return { sessionToken, maxAgeSec: Math.floor(deps.sessionTtlMs / 1000) };
};
