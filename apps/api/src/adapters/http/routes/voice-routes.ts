import {
  createVoiceRequestSchema,
  recordingScriptsResponseSchema,
  updateVoiceRequestSchema,
  voiceListResponseSchema,
  voiceSchema,
  type VoiceResponse,
} from "@voice-storybook/shared/contracts/v1";
import type { Hono } from "hono";

import type { RecordingScripts } from "../../../application/recording-scripts";
import type { UpdateVoiceResult, VoiceView } from "../../../application/voices";
import type { VoiceChange } from "../../../domain/voices/voice-change";
import { readJson } from "../errors";
import { failureCodeResponse } from "../failure-status";
import { requireSessionUser, type AppEnv } from "../principal";
import { isUuid } from "../uuid-param";

export type VoiceRouteDeps = {
  readonly createVoice: (userId: string, label: string) => Promise<VoiceView>;
  readonly listVoices: (userId: string) => Promise<readonly VoiceView[]>;
  readonly getVoice: (voiceId: string, userId: string) => Promise<VoiceView | null>;
  readonly updateVoice: (voiceId: string, userId: string, change: VoiceChange) => Promise<UpdateVoiceResult>;
  readonly scripts: RecordingScripts;
  readonly deleteVoice: (voiceId: string, userId: string) => Promise<boolean>;
  readonly deleteClip: (clipId: string, voiceId: string, userId: string) => Promise<boolean>;
};

const toVoiceResponse = (voice: VoiceView): VoiceResponse =>
  voiceSchema.parse({ ...voice, consent: voice.consent ?? "none" });

const registerDeleteRoutes = (app: Hono<AppEnv>, deps: VoiceRouteDeps): void => {
  app.delete("/v1/voices/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = isUuid(id) && (await deps.deleteVoice(id, requireSessionUser(c.get("principal"))));
    return deleted ? c.body(null, 204) : failureCodeResponse(c, "not_found");
  });
  app.delete("/v1/voices/:id/clips/:clipId", async (c) => {
    const { id, clipId } = c.req.param();
    const owner = requireSessionUser(c.get("principal"));
    const deleted = isUuid(id) && isUuid(clipId) && (await deps.deleteClip(clipId, id, owner));
    return deleted ? c.body(null, 204) : failureCodeResponse(c, "not_found");
  });
};

const registerUpdateRoute = (app: Hono<AppEnv>, deps: VoiceRouteDeps): void => {
  app.patch("/v1/voices/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return failureCodeResponse(c, "not_found");
    const change = await readJson(c, updateVoiceRequestSchema);
    if (change === null) return failureCodeResponse(c, "invalid_request");
    const result = await deps.updateVoice(id, requireSessionUser(c.get("principal")), change);
    return result.kind === "updated" ? c.json(toVoiceResponse(result.voice)) : failureCodeResponse(c, result.kind);
  });
};

export const voiceRoutes =
  (deps: VoiceRouteDeps) =>
  (app: Hono<AppEnv>): void => {
    registerDeleteRoutes(app, deps);
    registerUpdateRoute(app, deps);
    app.post("/v1/voices", async (c) => {
      const body = await readJson(c, createVoiceRequestSchema);
      if (body === null) return failureCodeResponse(c, "invalid_request");
      const voice = await deps.createVoice(requireSessionUser(c.get("principal")), body.label);
      return c.json(toVoiceResponse(voice), 201);
    });
    app.get("/v1/voices", async (c) => {
      const voices = await deps.listVoices(requireSessionUser(c.get("principal")));
      return c.json(voiceListResponseSchema.parse({ voices: voices.map(toVoiceResponse) }));
    });
    app.get("/v1/voices/:id", async (c) => {
      const id = c.req.param("id");
      const voice = isUuid(id) ? await deps.getVoice(id, requireSessionUser(c.get("principal"))) : null;
      return voice === null ? failureCodeResponse(c, "not_found") : c.json(toVoiceResponse(voice));
    });
    app.get("/v1/recording-scripts", (c) => c.json(recordingScriptsResponseSchema.parse(deps.scripts)));
  };
