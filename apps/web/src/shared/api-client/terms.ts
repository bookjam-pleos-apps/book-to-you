import { termsResponseSchema } from "@voice-storybook/shared/contracts/v1";
import { useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "./query-keys";
import { requestJson } from "./request";

// 로그인(otp/verify)과 동의 낭독(consent)이 함께 쓴다. 두 feature가 공유하므로 shared에 둔다.
export type Terms = { readonly termsVersion: string; readonly aiNoticeVersion: string };

const fetchTerms = (): Promise<Terms> => requestJson("GET", "/v1/terms", termsResponseSchema);

export const useTerms = () => useQuery({ queryKey: QUERY_KEYS.terms, queryFn: fetchTerms, staleTime: Infinity });
