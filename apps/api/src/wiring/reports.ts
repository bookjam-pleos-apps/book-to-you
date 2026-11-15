import { createLibraryRepo } from "../adapters/db/repos/library-repo";
import { createReportRepo } from "../adapters/db/repos/report-repo";
import { reportRoutes } from "../adapters/http/routes/report-routes";
import { submitReport } from "../application/reports";
import type { Infrastructure } from "./infrastructure";
import { shelfLibraryOf } from "./library";
import type { SharedShelfEnv } from "./shared-shelf-owner";

export const wireReportRoutes = (env: SharedShelfEnv, { database }: Infrastructure) =>
  reportRoutes({ submitReport: submitReport({ reports: createReportRepo(database), library: shelfLibraryOf(createLibraryRepo(database), env) }) });
