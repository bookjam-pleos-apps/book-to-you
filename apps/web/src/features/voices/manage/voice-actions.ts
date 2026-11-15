import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { QUERY_KEYS } from "../../../shared/api-client/query-keys";
import { HOME_PATH } from "../../../shared/routing/return-path";
import { voiceDetailPath } from "../voice-paths";
import { deleteVoice, updateVoice, type VoiceChange } from "../voices-api";

// 대표를 바꾸면 다른 목소리 행도 바뀐다. 목록과 상세를 둘 다 다시 받는다.
const refreshVoiceQueries = (queryClient: QueryClient, voiceId: string): void => {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voices });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voice(voiceId) });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.library });
};

export const useUpdateVoice = (voiceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: VoiceChange) => updateVoice(voiceId, change),
    onSuccess: () => refreshVoiceQueries(queryClient, voiceId),
  });
};

export const useRenameVoice = (voiceId: string) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => updateVoice(voiceId, { label }),
    onSuccess: () => {
      refreshVoiceQueries(queryClient, voiceId);
      navigate(voiceDetailPath(voiceId), { replace: true });
    },
  });
};

// 먼저 홈으로 옮긴 뒤 캐시를 지운다. 순서가 바뀌면 상세 화면이 사라진 목소리를 다시 받으려 한다.
export const useDeleteVoice = (voiceId: string) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteVoice(voiceId),
    onSuccess: () => {
      navigate(HOME_PATH, { replace: true });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.voice(voiceId) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voices });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.library });
    },
  });
};
