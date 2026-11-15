import type { Style } from "@voice-storybook/shared/vocab";
import { z } from "zod";

import type { RenderEngine, RenderOutput } from "../../application/render-worker/ports";
import type { RenderJob } from "../../application/renders/ports";
import type { EngineTaskState } from "../../domain/render-worker/render-worker-plan";
import { cancelTask, ComposeUnreachable, failureOf, getTask, runWorkflow, type ComposeHttp } from "./compose-tasks";
import { parseRenderReport, renderJobFiles, REPORT_FILE, STORY_FILE } from "./job-files";
import { packUstar, unpackUstar } from "./ustar";

export type ComposeRenderOptions = {
  readonly url: string;
  // 업로드(참조 녹음 몇 MB)와 결과(동화 한 편 수십 MB)는 조회보다 오래 걸린다.
  readonly requestTimeoutMs: number;
  readonly transferTimeoutMs: number;
  readonly fetcher?: typeof fetch;
};

const submittedSchema = z.object({ task_id: z.string().min(1) });
const taskSchema = z.object({ status: z.string() });
const cleanedSchema = z.object({ removed: z.boolean() });

const FAILED = new Set(["failed", "cancelled", "interrupted"]);

// pending, processing, cancelling, streaming과 모르는 상태는 도는 중으로 본다. 끝나지 않으면 워커의 시간 초과가 멈춘다.
export const taskStateOf = (status: string): EngineTaskState => {
  if (status === "completed") return "completed";
  return FAILED.has(status) ? "failed" : "running";
};

const reachedOrNull = async (request: Promise<Response>): Promise<Response | null> => {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ComposeUnreachable) return null;
    throw error;
  }
};

const bundleForm = (job: RenderJob, referenceWavs: ReadonlyMap<Style, Uint8Array>): FormData => {
  const form = new FormData();
  form.append("workflow_id", "render-story");
  form.append("wait_for_completion", "false");
  form.append("input[job_id]", job.renderId);
  form.append("input[bundle]", new File([Buffer.from(packUstar(renderJobFiles(job, referenceWavs)))], "bundle.tar", { type: "application/x-tar" }));
  return form;
};

const outputOf = (packed: Uint8Array): RenderOutput => {
  const entries = unpackUstar(packed);
  const report = entries.get(REPORT_FILE);
  const storyWav = entries.get(STORY_FILE);
  if (report === undefined || storyWav === undefined) throw new Error(`렌더 결과 묶음에 ${REPORT_FILE}, ${STORY_FILE}가 없다`);
  return { report: parseRenderReport(report), storyWav };
};

const jobRequest = (workflowId: string, renderId: string) => ({ workflow_id: workflowId, input: { job_id: renderId }, output_only: true });

type Engine = { readonly http: ComposeHttp; readonly requestTimeoutMs: number; readonly transferTimeoutMs: number };

const submit = ({ http, transferTimeoutMs }: Engine): RenderEngine["submit"] => async (job, referenceWavs) => {
  const response = await runWorkflow(http, bundleForm(job, referenceWavs), transferTimeoutMs);
  if (!response.ok) throw await failureOf(response, "render-story");
  return submittedSchema.parse(await response.json()).task_id;
};

const taskState = ({ http, requestTimeoutMs }: Engine): RenderEngine["taskState"] => async (taskId) => {
  const response = await reachedOrNull(getTask(http, taskId, requestTimeoutMs));
  if (response === null || response.status >= 500) return "unreachable";
  if (response.status === 404) return "gone";
  if (!response.ok) throw await failureOf(response, "task 조회");
  return taskStateOf(taskSchema.parse(await response.json()).status);
};

const errorSchema = z.object({ detail: z.string() });

// 셸 단계가 거부하면(결과 없음) stdout이 비어 JSON 해석 오류로 500이 온다(포크 5bd4e1e6, 맥 스모크).
// 그 밖의 오류(프록시, 서비스 장애)는 결과가 없다는 뜻이 아니다. 예외로 던져 다음 주기에 다시 묻는다.
const isStepRefusal = async (response: Response): Promise<boolean> => {
  if (response.status !== 500) return false;
  const body = errorSchema.safeParse(await response.clone().json().catch(() => null));
  return body.success && body.data.detail.startsWith("JSONDecodeError");
};

const result = ({ http, transferTimeoutMs }: Engine): RenderEngine["result"] => async (renderId) => {
  const response = await runWorkflow(http, jobRequest("render-result", renderId), transferTimeoutMs);
  if (response.ok) return outputOf(new Uint8Array(await response.arrayBuffer()));
  if (await isStepRefusal(response)) return null;
  throw await failureOf(response, "render-result");
};

const cancel = ({ http, requestTimeoutMs }: Engine): RenderEngine["cancel"] => async (taskId) => {
  const response = await cancelTask(http, taskId, requestTimeoutMs);
  if (response.ok || response.status === 404 || response.status === 409) return;
  throw await failureOf(response, "task 취소");
};

const cleanup = ({ http, requestTimeoutMs }: Engine): RenderEngine["cleanup"] => async (renderId) => {
  const response = await runWorkflow(http, jobRequest("render-cleanup", renderId), requestTimeoutMs);
  if (!response.ok) throw await failureOf(response, "render-cleanup");
  return cleanedSchema.parse(await response.json()).removed;
};

export const createComposeRenderEngine = ({ url, requestTimeoutMs, transferTimeoutMs, fetcher = fetch }: ComposeRenderOptions): RenderEngine => {
  const engine = { http: { url, fetcher }, requestTimeoutMs, transferTimeoutMs };
  return { submit: submit(engine), taskState: taskState(engine), result: result(engine), cancel: cancel(engine), cleanup: cleanup(engine) };
};
