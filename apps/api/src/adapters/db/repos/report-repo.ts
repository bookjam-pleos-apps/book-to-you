import type { ReportRepo } from "../../../application/reports/ports";
import type { Database } from "../client";
import { storyReports } from "../schema";

export const createReportRepo = (database: Database): ReportRepo => ({
  record: async (report) => {
    await database.insert(storyReports).values(report).onConflictDoNothing();
  },
});
