import { WAV_CONTENT_TYPE } from "../../domain/audio-content-type";

export type ComposeOptions = {
  readonly url: string;
  readonly timeoutMs: number;
  readonly fetcher?: typeof fetch;
};

export type UnavailableError = (message: string, cause?: unknown) => Error;

// GPU 서비스에는 스토리지 자격 증명을 주지 않으므로 경로가 아니라 음성 자체를 보낸다.
const audioForm = (workflowId: string, wav: Uint8Array): FormData => {
  const form = new FormData();
  form.append("workflow_id", workflowId);
  form.append("output_only", "true");
  form.append("input[audio_path]", new File([Buffer.from(wav)], "recording.wav", { type: WAV_CONTENT_TYPE }));
  return form;
};

const request = async ({ url, timeoutMs, fetcher = fetch }: ComposeOptions, body: FormData, unavailable: UnavailableError): Promise<Response> => {
  try {
    return await fetcher(url, { method: "POST", body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw unavailable(`전사 서비스에 닿지 못했다: ${url}`, error);
  }
};

// 음성 하나를 받는 워크플로우를 돌리고 출력(JSON)을 돌려준다. 응답 모양은 부르는 쪽이 확인한다.
export const runAudioWorkflow = async (options: ComposeOptions, workflowId: string, wav: Uint8Array, unavailable: UnavailableError): Promise<unknown> => {
  const response = await request(options, audioForm(workflowId, wav), unavailable);
  if (!response.ok) throw unavailable(`전사 서비스가 ${response.status}로 응답했다: ${await response.text()}`);
  return response.json();
};
