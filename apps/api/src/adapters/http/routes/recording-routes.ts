import {
  clipFormSchema,
  clipResponseSchema,
  consentFormSchema,
  consentPhraseResponseSchema,
  consentResponseSchema,
  promptFormSchema,
  promptResponseSchema,
  signalRejectedResponseSchema,
} from "@voice-storybook/shared/contracts/v1";
import { isPromptKind } from "@voice-storybook/shared/vocab";
import type { Context, Hono, MiddlewareHandler } from "hono";

import type {
  IssuedPhrase,
  SubmitConsentInput,
  SubmitConsentResult,
  UploadClipInput,
  UploadClipResult,
  UploadPromptInput,
  UploadPromptResult,
} from "../../../application/voices";
import { readAudioForm } from "../audio-form";
import { failureCodeResponse, type FailureCode } from "../failure-status";
import { requireSessionUser, type AppEnv } from "../principal";
import { isUuid } from "../uuid-param";

export type RecordingRouteDeps = {
  readonly issueConsentPhrase: (voiceId: string, userId: string) => Promise<IssuedPhrase | null>;
  readonly submitConsent: (input: SubmitConsentInput) => Promise<SubmitConsentResult>;
  readonly uploadClip: (input: UploadClipInput) => Promise<UploadClipResult>;
  readonly uploadPrompt: (input: UploadPromptInput) => Promise<UploadPromptResult>;
  readonly uploadBodyLimit: MiddlewareHandler<AppEnv>;
};

type Failure = { readonly kind: FailureCode } | { readonly kind: "rejected"; readonly reasons: readonly string[] };

const failureResponse = (c: Context, failure: Failure): Response => {
  if (failure.kind === "rejected") {
    return c.json(signalRejectedResponseSchema.parse({ error: "signal_rejected", reasons: failure.reasons }), 422);
  }
  return failureCodeResponse(c, failure.kind);
};

const registerConsentRoutes = (app: Hono<AppEnv>, deps: RecordingRouteDeps): void => {
  app.post("/v1/voices/:id/consent/phrase", async (c) => {
    const voiceId = c.req.param("id");
    const phrase = isUuid(voiceId) ? await deps.issueConsentPhrase(voiceId, requireSessionUser(c.get("principal"))) : null;
    return phrase === null ? failureCodeResponse(c, "not_found") : c.json(consentPhraseResponseSchema.parse(phrase));
  });
  app.post("/v1/voices/:id/consent", deps.uploadBodyLimit, async (c) => {
    const voiceId = c.req.param("id");
    if (!isUuid(voiceId)) return failureCodeResponse(c, "not_found");
    const form = await readAudioForm(c, consentFormSchema);
    if (form === null) return failureCodeResponse(c, "invalid_request");
    const { phraseToken, speakerLabel, termsVersion, aiNoticeVersion } = form.fields;
    const result = await deps.submitConsent({
      voiceId,
      userId: requireSessionUser(c.get("principal")),
      phraseToken,
      speakerLabel,
      termsVersion,
      aiNoticeVersion,
      upload: form.upload,
    });
    if (result.kind !== "checking") return failureResponse(c, result);
    return c.json(consentResponseSchema.parse({ id: result.consentId, status: "checking" }), 202);
  });
};

const registerClipRoutes = (app: Hono<AppEnv>, deps: RecordingRouteDeps): void => {
  app.post("/v1/voices/:id/clips", deps.uploadBodyLimit, async (c) => {
    const voiceId = c.req.param("id");
    if (!isUuid(voiceId)) return failureCodeResponse(c, "not_found");
    const form = await readAudioForm(c, clipFormSchema);
    if (form === null) return failureCodeResponse(c, "invalid_request");
    const userId = requireSessionUser(c.get("principal"));
    const result = await deps.uploadClip({ ...form.fields, voiceId, userId, upload: form.upload });
    if (result.kind !== "checking") return failureResponse(c, result);
    return c.json(clipResponseSchema.parse({ id: result.clipId, status: "checking" }), 202);
  });
};

const registerPromptRoutes = (app: Hono<AppEnv>, deps: RecordingRouteDeps): void => {
  app.post("/v1/voices/:id/prompts/:kind", deps.uploadBodyLimit, async (c) => {
    const { id: voiceId, kind } = c.req.param();
    if (!isUuid(voiceId) || !isPromptKind(kind)) return failureCodeResponse(c, "not_found");
    const form = await readAudioForm(c, promptFormSchema);
    if (form === null) return failureCodeResponse(c, "invalid_request");
    const userId = requireSessionUser(c.get("principal"));
    const result = await deps.uploadPrompt({ ...form.fields, voiceId, userId, kind, upload: form.upload });
    if (result.kind !== "stored") return failureResponse(c, result);
    return c.json(promptResponseSchema.parse({ id: result.promptId, kind }), 201);
  });
};

export const recordingRoutes =
  (deps: RecordingRouteDeps) =>
  (app: Hono<AppEnv>): void => {
    registerConsentRoutes(app, deps);
    registerClipRoutes(app, deps);
    registerPromptRoutes(app, deps);
  };
