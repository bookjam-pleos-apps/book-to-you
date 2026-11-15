import type { z } from "zod";

import { ApiError, toHttpFailure } from "./api-error";

// Hono csrf()는 Content-Type이 없는 POST·DELETE를 폼으로 보고 Origin을 검사한다.
// 본문이 없어도 JSON으로 표시해 폼 검사 대상에서 뺀다.
const JSON_HEADERS = { "content-type": "application/json" } as const;

type Method = "GET" | "POST" | "PATCH" | "DELETE";

// 시연 서버의 ngrok 무료 도메인은 브라우저 요청에 API 대신 200 text/html 경고 페이지를 준다.
// 경고를 넘긴 쿠키가 없거나 만료돼도 API 응답을 받게 모든 요청에 붙인다. 다른 서버는 이 헤더를 무시한다.
const SKIP_NGROK_WARNING = ["ngrok-skip-browser-warning", "1"] as const;

const withSkipNgrokWarning = (headers: HeadersInit | undefined): Headers => {
  const merged = new Headers(headers);
  merged.set(...SKIP_NGROK_WARNING);
  return merged;
};

const readBody = (response: Response): Promise<unknown> => response.json().catch(() => null);

const send = async (path: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(path, { ...init, headers: withSkipNgrokWarning(init.headers), credentials: "same-origin" });
  } catch {
    throw new ApiError({ kind: "network" });
  }
};

const ensureOk = async (response: Response): Promise<Response> => {
  if (response.ok) return response;
  throw new ApiError(toHttpFailure(response.status, await readBody(response)));
};

export const requestJson = async <Schema extends z.ZodType>(
  method: Method,
  path: string,
  schema: Schema,
  body?: unknown,
): Promise<z.infer<Schema>> => {
  const init = { method, headers: JSON_HEADERS, body: body === undefined ? null : JSON.stringify(body) };
  const response = await ensureOk(await send(path, init));
  return schema.parse(await readBody(response));
};

export const requestNoContent = async (method: Method, path: string, body?: unknown): Promise<void> => {
  const init = { method, headers: JSON_HEADERS, body: body === undefined ? null : JSON.stringify(body) };
  await ensureOk(await send(path, init));
};

// multipart는 브라우저가 boundary를 붙인 Content-Type을 직접 정한다.
export const requestForm = async <Schema extends z.ZodType>(
  path: string,
  form: FormData,
  schema: Schema,
): Promise<z.infer<Schema>> => {
  const response = await ensureOk(await send(path, { method: "POST", body: form }));
  return schema.parse(await readBody(response));
};
