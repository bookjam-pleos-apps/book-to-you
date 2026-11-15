import { z } from "zod";

import { TranscriberUnavailable, type Transcriber } from "../../application/ports/transcriber";
import { runAudioWorkflow, type ComposeOptions } from "./compose-workflow";

const TRANSCRIBE_WORKFLOW = "transcribe";
const transcriptSchema = z.string();

const unavailable = (message: string, cause?: unknown): Error => new TranscriberUnavailable(message, { cause });

export const createComposeTranscriber = (options: ComposeOptions): Transcriber => ({
  transcribe: async (wav) => transcriptSchema.parse(await runAudioWorkflow(options, TRANSCRIBE_WORKFLOW, wav, unavailable)).trim(),
});

// 연결이 없으면 판정하지 않는다. 통과로 처리하면 확인 없이 동의가 활성화된다.
export const unavailableTranscriber: Transcriber = {
  transcribe: () => Promise.reject(new TranscriberUnavailable("COMPOSE_URL이 설정되지 않았다")),
};
