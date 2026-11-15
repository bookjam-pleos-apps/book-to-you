import { manifestSchema, type Manifest } from "@voice-storybook/shared/contracts/v1";
import type { Hono } from "hono";

import type { Library, OpenAudioInput, OpenAudioResult } from "../../../application/library";
import { audioUrlOf } from "../audio-url";
import { failureCodeResponse } from "../failure-status";
import type { AppEnv, Principal } from "../principal";
import { isUuid } from "../uuid-param";

export type LibraryRouteDeps = {
  readonly getLibrary: (userId: string) => Promise<Library>;
  readonly openAudio: (input: OpenAudioInput) => Promise<OpenAudioResult>;
  readonly maxOfflineSeconds: number;
};

const ownerOf = (principal: Principal): string | null => (principal.kind === "anonymous" ? null : principal.userId);

const withAudioUrl = <Asset extends { readonly id: string }>({ id, ...asset }: Asset) => ({
  ...asset,
  audioUrl: audioUrlOf(id),
});

const toManifest = (library: Library, maxOfflineSeconds: number): Manifest =>
  manifestSchema.parse({
    schemaVersion: 1,
    maxOfflineSeconds,
    defaultVoiceId: library.defaultVoiceId,
    stories: library.stories.map((story) => ({ ...story, chapters: story.chapters.map(withAudioUrl) })),
    prompts: library.prompts.map((prompt) => ({ ...withAudioUrl(prompt), id: prompt.id })),
  });

const audioHeaders = (audio: { sha256: string; contentType: string }): Record<string, string> => ({
  "accept-ranges": "bytes",
  "cache-control": "private, no-store",
  "content-type": audio.contentType,
  etag: `"${audio.sha256}"`,
});

const audioResponse = (result: Extract<OpenAudioResult, { kind: "opened" }>): Response => {
  const { range, totalBytes, body } = result;
  const headers = audioHeaders(result);
  if (range === null) {
    return new Response(body, { status: 200, headers: { ...headers, "content-length": String(totalBytes) } });
  }
  return new Response(body, {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(range.end - range.start + 1),
      "content-range": `bytes ${range.start}-${range.end}/${totalBytes}`,
    },
  });
};

export const libraryRoutes =
  (deps: LibraryRouteDeps) =>
  (app: Hono<AppEnv>): void => {
    app.get("/v1/library/manifest", async (c) => {
      const owner = ownerOf(c.get("principal"));
      if (owner === null) return failureCodeResponse(c, "unauthenticated");
      return c.json(toManifest(await deps.getLibrary(owner), deps.maxOfflineSeconds));
    });
    app.get("/v1/audio/:id", async (c) => {
      const owner = ownerOf(c.get("principal"));
      if (owner === null) return failureCodeResponse(c, "unauthenticated");
      const audioId = c.req.param("id");
      if (!isUuid(audioId)) return failureCodeResponse(c, "not_found");
      const result = await deps.openAudio({
        audioId,
        userId: owner,
        rangeHeader: c.req.header("range"),
        headOnly: c.req.method === "HEAD",
      });
      if (result.kind === "not_found") return failureCodeResponse(c, "not_found");
      if (result.kind === "opened") return audioResponse(result);
      return c.body(null, 416, { "content-range": `bytes */${result.totalBytes}` });
    });
  };
