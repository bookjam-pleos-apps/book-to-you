import { describe, expect, it } from "vitest";

import { ClipAnalyzerUnavailable } from "../../application/ports/clip-analyzer";
import { createComposeClipAnalyzer, unavailableClipAnalyzer } from "./compose-clip-analyzer";

const URL = "http://127.0.0.1:18090/api/workflows/runs";
const WAV = new Uint8Array([1, 2, 3]);

const respondingWith = (response: Response) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return response;
  };
  return { calls, fetcher };
};

const analyzerFor = (fetcher: typeof fetch) => createComposeClipAnalyzer({ url: URL, timeoutMs: 1000, fetcher });

describe("compose clip analyzer", () => {
  it("sends the audio itself to the check-clip workflow and reads the transcript and the measure", async () => {
    const { calls, fetcher } = respondingWith(Response.json({ transcript: " 옛날 옛적에 ", measure: { voicedSeconds: 4.48, medianSemitones: 96.6 } }));
    expect(await analyzerFor(fetcher).analyze(WAV)).toEqual({
      transcript: "옛날 옛적에",
      measure: { voicedSeconds: 4.48, medianSemitones: 96.6 },
    });
    const form = calls[0]?.init?.body;
    if (!(form instanceof FormData)) throw new Error("multipart body expected");
    expect(form.get("workflow_id")).toBe("check-clip");
    expect(form.get("output_only")).toBe("true");
    const audio = form.get("input[audio_path]");
    if (!(audio instanceof File)) throw new Error("audio file expected");
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(WAV);
  });

  it("keeps a pitch that could not be measured as unknown", async () => {
    const { fetcher } = respondingWith(Response.json({ transcript: "", measure: { voicedSeconds: 0, medianSemitones: null } }));
    expect((await analyzerFor(fetcher).analyze(WAV)).measure).toEqual({ voicedSeconds: 0, medianSemitones: null });
  });

  it("refuses an answer without a measure instead of passing the clip unmeasured", async () => {
    const { fetcher } = respondingWith(Response.json({ transcript: "옛날 옛적에" }));
    await expect(analyzerFor(fetcher).analyze(WAV)).rejects.toThrow();
  });

  it("reports a service error as unavailable", async () => {
    const { fetcher } = respondingWith(new Response("busy", { status: 503 }));
    await expect(analyzerFor(fetcher).analyze(WAV)).rejects.toBeInstanceOf(ClipAnalyzerUnavailable);
  });

  it("reports an unreachable service as unavailable", async () => {
    const fetcher: typeof fetch = () => Promise.reject(new Error("connection refused"));
    await expect(analyzerFor(fetcher).analyze(WAV)).rejects.toBeInstanceOf(ClipAnalyzerUnavailable);
  });

  it("never analyzes when no service is configured", async () => {
    await expect(unavailableClipAnalyzer.analyze(WAV)).rejects.toBeInstanceOf(ClipAnalyzerUnavailable);
  });
});
