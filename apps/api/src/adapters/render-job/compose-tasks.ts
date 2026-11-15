// model-compose 포크(5bd4e1e6) HTTP 컨트롤러의 task API. 렌더 엔진 어댑터만 쓴다.
// 실행: POST <base>/workflows/runs, 조회: GET <base>/tasks/<id>, 취소: POST <base>/tasks/<id>/cancel.
export type ComposeHttp = {
  readonly url: string;
  readonly fetcher: typeof fetch;
};

export class ComposeUnreachable extends Error {}

const baseOf = (runsUrl: string): string => runsUrl.replace(/\/workflows\/runs\/?$/, "");

const send = async ({ fetcher }: ComposeHttp, url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  try {
    return await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ComposeUnreachable(`렌더 서비스에 닿지 못했다: ${url}`, { cause: error });
  }
};

export const runWorkflow = (http: ComposeHttp, body: FormData | object, timeoutMs: number): Promise<Response> => {
  const isForm = body instanceof FormData;
  const init: RequestInit = isForm
    ? { method: "POST", body }
    : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } };
  return send(http, http.url, init, timeoutMs);
};

export const getTask = (http: ComposeHttp, taskId: string, timeoutMs: number): Promise<Response> =>
  send(http, `${baseOf(http.url)}/tasks/${encodeURIComponent(taskId)}`, { method: "GET" }, timeoutMs);

// 기다리며 부르면 대기열에서 취소된 task가 cancelling에 머물러 응답이 오지 않는다(포크 work_queue). 기다리지 않는다.
export const cancelTask = (http: ComposeHttp, taskId: string, timeoutMs: number): Promise<Response> =>
  send(http, `${baseOf(http.url)}/tasks/${encodeURIComponent(taskId)}/cancel?wait_for_completion=false`, { method: "POST" }, timeoutMs);

export const failureOf = async (response: Response, what: string): Promise<Error> =>
  new Error(`${what}: 렌더 서비스가 ${response.status}로 응답했다: ${(await response.text()).slice(0, 300)}`);
