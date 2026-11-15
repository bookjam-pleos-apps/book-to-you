import { and, eq } from "drizzle-orm";

import type { NewPrompt, PromptReplacement, PromptRepo } from "../../../application/voices/ports";
import type { Database } from "../client";
import { pendingPurges, voicePrompts } from "../schema";
import { lockActiveConsentId } from "./consent-gate";

const replaceUnderLock = async (database: Database, { userId, voiceId, ...prompt }: NewPrompt): Promise<PromptReplacement> => {
  const consentId = await lockActiveConsentId(database, voiceId, userId);
  if (consentId === null) return "consent_inactive";
  const replaced = await database
    .delete(voicePrompts)
    .where(and(eq(voicePrompts.voiceProfileId, voiceId), eq(voicePrompts.kind, prompt.kind)))
    .returning({ storageKey: voicePrompts.storageKey });
  const purges = replaced.map(({ storageKey }) => ({ storagePrefix: storageKey, engineKeys: [] }));
  if (purges.length > 0) await database.insert(pendingPurges).values(purges);
  await database.insert(voicePrompts).values({ ...prompt, voiceProfileId: voiceId, consentId });
  return replaced.length > 0 ? "replaced" : "inserted";
};

export const createPromptRepo = (database: Database): PromptRepo => ({
  replaceIfConsentActive: (prompt) => database.transaction((transaction) => replaceUnderLock(transaction, prompt)),
});
