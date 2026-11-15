import { QueryClient } from "@tanstack/react-query";

import { failureStatus } from "../shared/api-client/api-error";
import { QUERY_KEYS } from "../shared/api-client/query-keys";

// 어느 요청이든 401이면 로그인이 풀린 것이다. 화면마다 따로 막지 않고 세션을 다시 받아,
// RequireSession이 로그인 화면으로 보냈다가(next=지금 주소) 로그인 뒤 같은 화면으로 돌아오게 한다.
export const isSessionLost = (error: unknown): boolean => failureStatus(error) === 401;

const recheckSessionOnLoss = (queryClient: QueryClient): void => {
  const recheck = (error: unknown) => {
    if (isSessionLost(error)) void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.me });
  };
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") recheck(event.action.error);
  });
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") recheck(event.action.error);
  });
};

// 서버 상태는 TanStack Query로만 다룬다. 바꾸는 요청(mutation)은 자동으로 다시 보내지 않는다.
export const createQueryClient = (): QueryClient => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 }, mutations: { retry: false } } });
  recheckSessionOnLoss(queryClient);
  return queryClient;
};
