import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RenderJob } from "../../application/renders/ports";
import { createComposeRenderEngine } from "./compose-render-engine";
import { unpackUstar } from "./ustar";

const URL_RUNS = "http://127.0.0.1:18090/api/workflows/runs";
const JOB: RenderJob = {
  renderId: "0b6f3c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f",
  storyId: "s1",
  model: "model",
  seed: 1,
  limits: { maxSyllables: 180, minSyllables: 30 },
  references: [{ style: "calm", text: "대본" }],
  readAs: { calm: "calm" },
  lines: [{ text: "문장", style: "calm", pauseAfterMs: 450 }],
};

type Call = { readonly url: string; readonly init: RequestInit | undefined };

const fakeFetch = (reply: (call: Call) => Response | Error) => {
  const calls: Call[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call = { url: String(input), init };
    calls.push(call);
    const response = reply(call);
    if (response instanceof Error) throw response;
    return response;
  };
  return { calls, engine: createComposeRenderEngine({ url: URL_RUNS, requestTimeoutMs: 1000, transferTimeoutMs: 1000, fetcher }) };
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("compose render engine", () => {
  it("submits the job bundle without waiting and returns the task id", async () => {
    const { calls, engine } = fakeFetch(() => json({ task_id: "T1", status: "pending" }));

    expect(await engine.submit(JOB, new Map([["calm", new Uint8Array([9])]]))).toBe("T1");
    const form = calls[0]?.init?.body;
    if (!(form instanceof FormData)) throw new Error("multipart가 아니다");
    expect([form.get("workflow_id"), form.get("wait_for_completion"), form.get("input[job_id]")]).toEqual(["render-story", "false", JOB.renderId]);
    const bundle = form.get("input[bundle]");
    if (!(bundle instanceof Blob)) throw new Error("묶음이 없다");
    const entries = unpackUstar(new Uint8Array(await bundle.arrayBuffer()));
    expect([...entries.keys()]).toEqual(["job.json", "reference-calm.wav"]);
    expect(entries.get("reference-calm.wav")).toEqual(new Uint8Array([9]));
  });

  it.each([
    [json({ status: "processing" }), "running"],
    [json({ status: "cancelling" }), "running"],
    [json({ status: "completed" }), "completed"],
    [json({ status: "cancelled" }), "failed"],
    [json({ status: "failed" }), "failed"],
    [json({ detail: "Task not found" }, 404), "gone"],
    [new TypeError("fetch failed"), "unreachable"],
  ] as const)("reads a task reply as %s", async (reply, state) => {
    const { calls, engine } = fakeFetch(() => (reply instanceof Response ? reply.clone() : reply));

    expect(await engine.taskState("T1")).toBe(state);
    expect(calls[0]?.url).toBe("http://127.0.0.1:18090/api/tasks/T1");
  });

  it("reads the packed result and treats a failed result workflow as no result", async () => {
    const packed = await readFile(join(import.meta.dirname, "fixtures", "result.example.tar"));
    const ok = fakeFetch(() => new Response(packed));
    const missing = fakeFetch(() => json({ detail: "JSONDecodeError: Expecting value: line 1 column 1 (char 0)" }, 500));

    expect((await ok.engine.result(JOB.renderId))?.storyWav).toEqual(new TextEncoder().encode("RIFFstory"));
    expect(JSON.parse(String(ok.calls[0]?.init?.body))).toEqual({ workflow_id: "render-result", input: { job_id: JOB.renderId }, output_only: true });
    expect(await missing.engine.result(JOB.renderId)).toBeNull();
  });

  it("asks again later instead of calling a result missing when the service itself fails", async () => {
    await expect(fakeFetch(() => json({ detail: "Bad gateway" }, 502)).engine.result(JOB.renderId)).rejects.toThrow(/render-result/);
    await expect(fakeFetch(() => json({ detail: "RuntimeError: boom" }, 500)).engine.result(JOB.renderId)).rejects.toThrow(/render-result/);
  });

  it("cancels without waiting and ignores a task that already finished", async () => {
    const { calls, engine } = fakeFetch(() => json({ detail: "already finished" }, 409));

    await engine.cancel("T1");
    expect(calls[0]?.url).toBe("http://127.0.0.1:18090/api/tasks/T1/cancel?wait_for_completion=false");
  });

  it("reports whether cleanup removed the folder and fails loudly otherwise", async () => {
    expect(await fakeFetch(() => json({ removed: true })).engine.cleanup(JOB.renderId)).toBe(true);
    await expect(fakeFetch(() => json({ detail: "x" }, 500)).engine.cleanup(JOB.renderId)).rejects.toThrow(/render-cleanup/);
  });
});
