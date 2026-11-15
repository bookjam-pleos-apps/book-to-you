import { describe, expect, it } from "vitest";
import { z } from "zod";

import manifestExample from "./examples/manifest.json";
import * as contracts from "./index";

const jsonSchemaEntries = Object.entries(contracts).flatMap(([name, value]) =>
  value instanceof z.ZodType ? [[name, z.toJSONSchema(value)]] : [],
);

const requiredFields = (schema: z.ZodType): readonly string[] => z.toJSONSchema(schema).required ?? [];

// 스냅샷은 -u로 갱신하면 삭제도 통과한다. 차량 앱이 읽는 필드는 손으로 적어 고정한다.
const FIELDS_VEHICLE_APP_READS: ReadonlyArray<[string, z.ZodType, readonly string[]]> = [
  ["manifest", contracts.manifestSchema, ["schemaVersion", "maxOfflineSeconds", "defaultVoiceId", "stories", "prompts"]],
  ["story", contracts.manifestStorySchema, ["renderId", "storyId", "title", "voiceId", "voiceLabel", "chapters"]],
  ["chapter", contracts.manifestChapterSchema, ["index", "role", "title", "durationMs", "bytes", "sha256", "audioUrl"]],
  ["prompt", contracts.manifestPromptSchema, ["id", "kind", "voiceId", "durationMs", "bytes", "sha256", "audioUrl"]],
  ["pair start", contracts.pairStartResponseSchema, ["deviceCode", "userCode", "verificationUri", "expiresInSec", "intervalSec"]],
  ["pair token", contracts.pairTokenResponseSchema, ["accessToken", "tokenType"]],
  ["pair demo", contracts.pairDemoRequestSchema, ["deviceName", "demoCode"]],
];

describe("contract v1", () => {
  it("keeps the JSON schema of every contract stable", () => {
    expect(Object.fromEntries(jsonSchemaEntries)).toMatchSnapshot();
  });

  it.each(FIELDS_VEHICLE_APP_READS)("never drops a required %s field", (_name, schema, fields) => {
    expect(requiredFields(schema)).toEqual(expect.arrayContaining([...fields]));
  });

  it("accepts the example shared with the vehicle app", () => {
    expect(contracts.manifestSchema.safeParse(manifestExample).success).toBe(true);
  });

  it("accepts a manifest with no prompts yet", () => {
    const parsed = contracts.manifestSchema.parse(manifestExample);
    expect(parsed.prompts).toEqual([]);
  });

  it("rejects an audio url that is not the fixed audio path", () => {
    const signedUrl = "https://storage.example.com/signed?x=1";
    const [story] = manifestExample.stories;
    const [chapter] = story?.chapters ?? [];
    const tampered = {
      ...manifestExample,
      stories: [{ ...story, chapters: [{ ...chapter, audioUrl: signedUrl }] }],
    };
    expect(contracts.manifestSchema.safeParse(tampered).success).toBe(false);
  });

  it("tells a vehicle app to slow down with the RFC 8628 error code", () => {
    expect(contracts.pairTokenErrorSchema.safeParse({ error: "slow_down" }).success).toBe(true);
    expect(contracts.pairTokenErrorSchema.safeParse({ error: "denied" }).success).toBe(false);
  });
});
