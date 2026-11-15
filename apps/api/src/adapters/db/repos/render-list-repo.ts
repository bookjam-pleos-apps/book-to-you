import { eq, type SQL } from "drizzle-orm";

import type { RenderListRepo } from "../../../application/renders/ports";
import type { RenderRow } from "../../../domain/renders/render-status";
import type { Database } from "../client";
import { consentRecords, renders, voiceProfiles } from "../schema";
import { activeConsentOfVoice } from "./consent-gate";

export const selectRenderRows = async (database: Database, condition: SQL | undefined): Promise<readonly RenderRow[]> => {
  const rows = await database
    .select({
      renderId: renders.id,
      voiceId: voiceProfiles.id,
      voiceLabel: voiceProfiles.label,
      storyId: renders.storyId,
      status: renders.status,
      activeConsentId: consentRecords.id,
      startedAt: renders.startedAt,
    })
    .from(renders)
    .innerJoin(voiceProfiles, eq(voiceProfiles.id, renders.voiceProfileId))
    .leftJoin(consentRecords, activeConsentOfVoice)
    .where(condition);
  return rows.map(({ activeConsentId, ...row }) => ({ ...row, consentActive: activeConsentId !== null }));
};

export const createRenderListRepo = (database: Database): RenderListRepo => ({
  listRenderRows: (userId) => selectRenderRows(database, eq(renders.userId, userId)),
});
