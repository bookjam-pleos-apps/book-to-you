import { describe, expect, it } from "vitest";

import { TranscriberUnavailable } from "../../application/ports/transcriber";
import { createComposeTranscriber, unavailableTranscriber } from "./compose-transcriber";

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

const options = (fetcher: typeof fetch) => ({ url: URL, timeoutMs: 1000, fetcher });

describe("compose transcriber", () => {
  it("sends the audio itself to the transcribe workflow and trims the transcript", async () => {
    const { calls, fetcher } = respondingWith(Response.json(" 옛날 옛적에 "));
    expect(await createComposeTranscriber(options(fetcher)).transcribe(WAV)).toBe("옛날 옛적에");
    const form = calls[0]?.init?.body;
    if (!(form instanceof FormData)) throw new Error("multipart body expected");
    expect(form.get("workflow_id")).toBe("transcribe");
    expect(form.get("output_only")).toBe("true");
    const audio = form.get("input[audio_path]");
    if (!(audio instanceof File)) throw new Error("audio file expected");
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(WAV);
  });

  it("reports a service error as unavailable instead of an empty transcript", async () => {
    const { fetcher } = respondingWith(new Response("busy", { status: 503 }));
    await expect(createComposeTranscriber(options(fetcher)).transcribe(WAV)).rejects.toBeInstanceOf(TranscriberUnavailable);
  });

  it("reports an unreachable service as unavailable", async () => {
    const fetcher: typeof fetch = () => Promise.reject(new Error("connection refused"));
    await expect(createComposeTranscriber(options(fetcher)).transcribe(WAV)).rejects.toBeInstanceOf(TranscriberUnavailable);
  });

  it("never transcribes when no service is configured", async () => {
    await expect(unavailableTranscriber.transcribe(WAV)).rejects.toBeInstanceOf(TranscriberUnavailable);
  });
});
