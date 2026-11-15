import { useMutation, useQueryClient } from "@tanstack/react-query";

import { failureStatus } from "../../shared/api-client/api-error";
import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import { createRender } from "./library-api";
import { makeFailureOf, type MakeFailure } from "./make-failure";

export type StartMaking = {
  readonly start: () => void;
  readonly pending: boolean;
  // 요청이 받아들여졌다. 목록을 새로 받기 전까지 다시 누르지 않게 한다.
  readonly started: boolean;
  readonly failure: MakeFailure | null;
};

// 동화 만들기 화면과 듣기 화면(실패한 동화)이 같이 쓴다. 성공하면 책장 목록을 다시 받는다.
// 404는 목록이 낡았다는 뜻이라 실패해도 책장과 열어 둔 동화를 다시 받는다.
export const useStartMaking = (storyId: string, voiceId: string, onStarted?: () => void): StartMaking => {
  const queryClient = useQueryClient();
  const refreshLibrary = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.library });
  const make = useMutation({
    mutationFn: () => createRender(storyId, voiceId),
    onSuccess: () => {
      refreshLibrary();
      onStarted?.();
    },
    onError: (error) => {
      if (failureStatus(error) !== 404) return;
      refreshLibrary();
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.renders });
    },
  });
  return {
    start: () => make.mutate(),
    pending: make.isPending,
    started: make.isSuccess,
    failure: make.isError ? makeFailureOf(make.error) : null,
  };
};
