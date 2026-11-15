import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { requestForm, requestJson } from "./request";

const captureFetch = () => {
  const calls: RequestInit[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    calls.push(init);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  return calls;
};

const headersOf = (init: RequestInit | undefined): Headers => new Headers(init?.headers);

describe("request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks ngrok to skip its browser warning on JSON requests and keeps the JSON content type", async () => {
    const calls = captureFetch();
    await requestJson("POST", "/v1/x", z.object({ ok: z.boolean() }), {});
    expect(headersOf(calls[0]).get("ngrok-skip-browser-warning")).toBe("1");
    expect(headersOf(calls[0]).get("content-type")).toBe("application/json");
  });

  it("lets the browser pick the multipart content type while skipping the warning", async () => {
    const calls = captureFetch();
    await requestForm("/v1/x", new FormData(), z.object({ ok: z.boolean() }));
    expect(headersOf(calls[0]).get("ngrok-skip-browser-warning")).toBe("1");
    expect(headersOf(calls[0]).get("content-type")).toBeNull();
  });
});
