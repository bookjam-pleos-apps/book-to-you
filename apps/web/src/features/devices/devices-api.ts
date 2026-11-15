import { deviceListResponseSchema } from "@voice-storybook/shared/contracts/v1";
import { useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import { requestJson, requestNoContent } from "../../shared/api-client/request";

export const PAIR_PATH = "/pair";
export const PAIR_DONE_PATH = "/pair/done";

// 성공하면 본문 없는 204다. 코드가 틀리거나 만료되면 404 invalid_user_code다.
export const confirmPairing = (userCode: string): Promise<void> =>
  requestNoContent("POST", "/v1/devices/pair/confirm", { userCode });

export const useDevices = () =>
  useQuery({ queryKey: QUERY_KEYS.devices, queryFn: () => requestJson("GET", "/v1/devices", deviceListResponseSchema) });
