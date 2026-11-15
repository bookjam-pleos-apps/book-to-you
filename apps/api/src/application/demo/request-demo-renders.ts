import { mapInSequence } from "../../domain/in-sequence";
import type { RequestRenderInput, RequestRenderResult } from "../renders";
import type { VoiceRepo } from "../voices";
import { findDemoVoice } from "./demo-voice";

// 데모 계정에는 로그인 세션이 없다. 웹의 "만들기"와 같은 요청을 운영자가 대신 넣고, 렌더 워커가 처리한다.
export type DemoRenderOutcome = { readonly storyId: string; readonly result: RequestRenderResult };

export type RequestDemoRendersResult =
  | { readonly kind: "requested"; readonly voiceId: string; readonly renders: readonly DemoRenderOutcome[] }
  | { readonly kind: "no_single_voice"; readonly voices: number };

export type RequestDemoRendersDeps = {
  readonly voices: Pick<VoiceRepo, "list">;
  readonly requestRender: (input: RequestRenderInput) => Promise<RequestRenderResult>;
};

export const requestDemoRenders =
  (deps: RequestDemoRendersDeps) =>
  async (userId: string, storyIds: readonly string[]): Promise<RequestDemoRendersResult> => {
    const lookup = await findDemoVoice(deps.voices, userId);
    if (lookup.kind !== "found") return lookup;
    const voiceId = lookup.voice.id;
    // 대기열 상한(사용자당 진행 중 3편)이 순서대로 적용되도록 한 편씩 넣는다.
    const renders = await mapInSequence(storyIds, async (storyId): Promise<DemoRenderOutcome> => ({
      storyId,
      result: await deps.requestRender({ userId, voiceId, storyId }),
    }));
    return { kind: "requested", voiceId, renders };
  };
