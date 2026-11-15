import { reportRequestSchema } from "@voice-storybook/shared/contracts/v1";
import type { Hono } from "hono";

import type { SubmitReportInput, SubmitReportResult } from "../../../application/reports";
import { readJson } from "../errors";
import { failureCodeResponse } from "../failure-status";
import type { AppEnv, Principal } from "../principal";
import { isUuid } from "../uuid-param";

export type ReportRouteDeps = {
  readonly submitReport: (input: SubmitReportInput) => Promise<SubmitReportResult>;
};

const reporterOf = (principal: Principal): { userId: string; deviceId: string | null } | null => {
  if (principal.kind === "anonymous") return null;
  return { userId: principal.userId, deviceId: principal.kind === "device" ? principal.deviceId : null };
};

export const reportRoutes =
  (deps: ReportRouteDeps) =>
  (app: Hono<AppEnv>): void => {
    app.post("/v1/reports", async (c) => {
      const reporter = reporterOf(c.get("principal"));
      if (reporter === null) return failureCodeResponse(c, "unauthenticated");
      const body = await readJson(c, reportRequestSchema);
      if (body === null) return failureCodeResponse(c, "invalid_request");
      if (!isUuid(body.renderId)) return failureCodeResponse(c, "not_found");
      const result = await deps.submitReport({ ...reporter, ...body });
      return result.kind === "recorded" ? c.body(null, 204) : failureCodeResponse(c, "not_found");
    });
  };
