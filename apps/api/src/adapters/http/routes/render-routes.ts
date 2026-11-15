import { createRenderRequestSchema, renderDetailSchema, renderListResponseSchema, renderSchema, storyListResponseSchema } from "@voice-storybook/shared/contracts/v1";
import type { Context, Hono } from "hono";

import type { RenderDetail, RenderListItem, RequestRenderInput, RequestRenderResult } from "../../../application/renders";
import type { ListedStory } from "../../../application/stories";
import { audioUrlOf } from "../audio-url";
import { readJson } from "../errors";
import { failureCodeResponse } from "../failure-status";
import { requireSessionUser, type AppEnv } from "../principal";
import { isUuid } from "../uuid-param";

export type RenderRouteDeps = {
  readonly listStories: () => readonly ListedStory[];
  readonly listRenders: (userId: string) => Promise<readonly RenderListItem[]>;
  readonly requestRender: (input: RequestRenderInput) => Promise<RequestRenderResult>;
  readonly getRender: (userId: string, renderId: string) => Promise<RenderDetail | null>;
};

const toRenderDetail = ({ chapters, ...render }: RenderDetail) =>
  renderDetailSchema.parse({
    ...render,
    chapters: chapters.map(({ index, role, title, durationMs, id }) => ({ index, role, title, durationMs, audioUrl: audioUrlOf(id) })),
  });

const FAILURE_CODES = {
  unknown_story: "not_found",
  voice_not_found: "not_found",
  no_active_consent: "no_active_consent",
  no_passed_clip: "no_passed_clip",
  ambiguous_clip: "ambiguous_clip",
  unknown_script: "unknown_script",
  unrenderable_line: "unrenderable_line",
  too_many_pending: "too_many_pending",
} as const;

// 남의 렌더와 없는 렌더를 구별하지 않는다(404).
const renderDetailHandler = (deps: RenderRouteDeps) => async (c: Context<AppEnv>) => {
  const userId = requireSessionUser(c.get("principal"));
  const renderId = c.req.param("id") ?? "";
  const render = isUuid(renderId) ? await deps.getRender(userId, renderId) : null;
  return render === null ? failureCodeResponse(c, "not_found") : c.json(toRenderDetail(render));
};

export const renderRoutes =
  (deps: RenderRouteDeps) =>
  (app: Hono<AppEnv>): void => {
    app.get("/v1/stories", (c) => {
      requireSessionUser(c.get("principal"));
      return c.json(storyListResponseSchema.parse({ stories: deps.listStories() }));
    });
    app.get("/v1/renders", async (c) => {
      const renders = await deps.listRenders(requireSessionUser(c.get("principal")));
      return c.json(renderListResponseSchema.parse({ renders }));
    });
    app.get("/v1/renders/:id", renderDetailHandler(deps));
    app.post("/v1/renders", async (c) => {
      const userId = requireSessionUser(c.get("principal"));
      const request = await readJson(c, createRenderRequestSchema);
      if (request === null) return failureCodeResponse(c, "invalid_request");
      if (!isUuid(request.voiceId)) return failureCodeResponse(c, "not_found");
      const result = await deps.requestRender({ userId, ...request });
      if (result.kind !== "queued" && result.kind !== "existing") return failureCodeResponse(c, FAILURE_CODES[result.kind]);
      return c.json(renderSchema.parse(result.render), result.kind === "queued" ? 202 : 200);
    });
  };
