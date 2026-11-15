import type { MeResponse } from "@voice-storybook/shared/contracts/v1";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import { useTerms, type Terms } from "../../shared/api-client/terms";

// 계정을 여는 요청(로그인 코드 확인, 바로 시작하기)은 지금 약관 버전을 함께 보내고, 성공하면 내 정보를 캐시에 넣는다.
export const useSignIn = <Input>(request: (input: Input, terms: Terms) => Promise<MeResponse>, onSignedIn: () => void) => {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const signIn = useMutation({
    mutationFn: (input: Input) => (terms.data ? request(input, terms.data) : Promise.reject(new Error("terms"))),
    onSuccess: (me) => {
      queryClient.setQueryData(QUERY_KEYS.me, me);
      onSignedIn();
    },
  });
  return { signIn, terms };
};
