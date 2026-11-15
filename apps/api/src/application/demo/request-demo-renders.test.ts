import { describe, expect, it } from "vitest";

import type { RequestRenderInput, RequestRenderResult } from "../renders";
import type { VoiceRecord } from "../voices";
import { requestDemoRenders } from "./request-demo-renders";

const voice = (id: string): VoiceRecord => ({ id, label: "엄마", consent: "active", consentRejected: false, isDefault: false, clips: [] });

describe("requestDemoRenders", () => {
  it("requests each story in order for the demo user's only voice and returns each result", async () => {
    const requested: RequestRenderInput[] = [];
    const requestRender = async (input: RequestRenderInput): Promise<RequestRenderResult> => {
      requested.push(input);
      return { kind: "too_many_pending" };
    };
    const run = requestDemoRenders({ voices: { list: async () => [voice("voice-1")] }, requestRender });

    const result = await run("user-1", ["redhood", "fisherman"]);

    expect(requested).toEqual([
      { userId: "user-1", voiceId: "voice-1", storyId: "redhood" },
      { userId: "user-1", voiceId: "voice-1", storyId: "fisherman" },
    ]);
    expect(result).toEqual({
      kind: "requested",
      voiceId: "voice-1",
      renders: [
        { storyId: "redhood", result: { kind: "too_many_pending" } },
        { storyId: "fisherman", result: { kind: "too_many_pending" } },
      ],
    });
  });

  it("asks the operator to settle the voice when the demo user does not have exactly one", async () => {
    const run = requestDemoRenders({ voices: { list: async () => [voice("a"), voice("b")] }, requestRender: async () => ({ kind: "too_many_pending" }) });

    expect(await run("user-1", ["redhood"])).toEqual({ kind: "no_single_voice", voices: 2 });
  });
});
