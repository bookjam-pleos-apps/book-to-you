import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";

import { QUERY_KEYS } from "../../../shared/api-client/query-keys";
import { feedbackFromError, needsRetake, VERIFY_FAILED_FEEDBACK, type Feedback } from "./recording-feedback";
import type { UploadOutcome } from "./upload-outcome";
import { refreshVoice } from "../voices-api";

type Judge = (voice: VoiceResponse, uploadedId: string) => UploadOutcome;

type CheckedUploadOptions = {
  readonly voiceId: string;
  // 올리고 나서 판정을 찾을 id를 돌려준다(클립 id, 동의 id, 안내 음성 id).
  readonly send: (audio: File) => Promise<string>;
  readonly judge: Judge;
  // 탈락한 이유를 아는 녹음만 준다. 없으면 대본과 달랐다고 안내한다.
  readonly failedFeedback?: (voice: VoiceResponse, uploadedId: string) => Feedback;
  readonly onPassed: () => void;
  // 서버가 "이미 끝났다"고 거절한 경우다(예: 다른 기기에서 확인된 낭독). 통과로 보고 넘어간다.
  readonly alreadyDone?: (error: unknown) => boolean;
};

type Checked = { readonly outcome: UploadOutcome; readonly feedback: Feedback | null };

const STILL_CHECKING: Checked = { outcome: "checking", feedback: null };

export type CheckedUpload = {
  readonly upload: (audio: File) => void;
  readonly uploading: boolean;
  readonly feedback: Feedback | null;
  readonly checking: boolean;
  // 방금 올린 녹음이 통과했지만 코칭이 붙었다. 이 값은 여기에만 있어, 화면에 다시 들어오면 코칭이 보이지 않는다.
  readonly advised: boolean;
  // 방금 올린 녹음이 판정에서 떨어졌다. 같은 녹음을 다시 올리지 않고 새로 녹음하게 한다.
  readonly retake: boolean;
  // 새로 녹음을 시작하면 앞 녹음의 결과를 지운다.
  readonly reset: () => void;
};

const judged = ({ judge, failedFeedback }: CheckedUploadOptions, voice: VoiceResponse, uploadedId: string): Checked => {
  const outcome = judge(voice, uploadedId);
  if (outcome !== "failed") return { outcome, feedback: null };
  return { outcome, feedback: failedFeedback?.(voice, uploadedId) ?? VERIFY_FAILED_FEEDBACK };
};

// 녹음은 이미 올라갔다. 판정을 못 읽었으면 다시 올리지 않고 확인 중으로 둔다(홈에서 다시 본다).
const readOutcome = async (queryClient: QueryClient, options: CheckedUploadOptions, uploadedId: string): Promise<Checked> => {
  try {
    return judged(options, await refreshVoice(queryClient, options.voiceId), uploadedId);
  } catch {
    return STILL_CHECKING;
  }
};

export const useCheckedUpload = (options: CheckedUploadOptions): CheckedUpload => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    // 실패한 업로드를 자동으로 다시 보내지 않는다. 서버는 업로드마다 새 행을 만들어, 저장된 뒤 응답만 잃은 경우 같은 녹음이 두 번 남는다.
    mutationFn: async (audio: File) => readOutcome(queryClient, options, await options.send(audio)),
    onSuccess: ({ outcome }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voices });
      if (outcome === "passed") options.onPassed();
    },
    onError: (error) => {
      if (options.alreadyDone?.(error) === true) options.onPassed();
    },
  });
  return {
    upload: (audio) => mutation.mutate(audio),
    uploading: mutation.isPending,
    feedback: mutation.error === null ? (mutation.data?.feedback ?? null) : feedbackFromError(mutation.error),
    checking: mutation.data?.outcome === "checking",
    advised: mutation.data?.outcome === "advised",
    retake: needsRetake(mutation.error, mutation.data?.outcome),
    reset: mutation.reset,
  };
};
