import { z } from "zod";

import { ClipAnalyzerUnavailable, type ClipAnalyzer } from "../../application/ports/clip-analyzer";
import { runAudioWorkflow, type ComposeOptions } from "./compose-workflow";

const CHECK_CLIP_WORKFLOW = "check-clip";

// gpu/compose/voice-clone의 check-clip 출력이다. 측정은 spike.run_voice_measure가 한다.
const analysisSchema = z.object({
  transcript: z.string(),
  measure: z.object({ voicedSeconds: z.number().nonnegative(), medianSemitones: z.number().nullable() }),
});

const unavailable = (message: string, cause?: unknown): Error => new ClipAnalyzerUnavailable(message, { cause });

export const createComposeClipAnalyzer = (options: ComposeOptions): ClipAnalyzer => ({
  analyze: async (wav) => {
    const { transcript, measure } = analysisSchema.parse(await runAudioWorkflow(options, CHECK_CLIP_WORKFLOW, wav, unavailable));
    return { transcript: transcript.trim(), measure };
  },
});

// 연결이 없으면 판정하지 않는다. 통과로 처리하면 확인 없이 녹음이 참조로 쓰인다.
export const unavailableClipAnalyzer: ClipAnalyzer = {
  analyze: () => Promise.reject(new ClipAnalyzerUnavailable("COMPOSE_URL이 설정되지 않았다")),
};
