import {
  createRenderRequestSchema,
  renderDetailSchema,
  renderListResponseSchema,
  renderSchema,
  storyListResponseSchema,
} from "@voice-storybook/shared/contracts/v1";
import { useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import { requestJson } from "../../shared/api-client/request";
import { hasMaking } from "./shelf";

const MAKING_POLL_MS = 3000;

export const useStories = () =>
  useQuery({
    queryKey: QUERY_KEYS.stories,
    queryFn: () => requestJson("GET", "/v1/stories", storyListResponseSchema),
    staleTime: 60_000,
  });

// 만드는 중인 동화가 있을 때만 다시 받는다. 없으면 포커스 복귀 때만 받는다.
export const useRenders = () =>
  useQuery({
    queryKey: QUERY_KEYS.library,
    queryFn: () => requestJson("GET", "/v1/renders", renderListResponseSchema),
    refetchInterval: (query) => (hasMaking(query.state.data?.renders ?? []) ? MAKING_POLL_MS : false),
  });

export const useRender = (renderId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.render(renderId),
    queryFn: () => requestJson("GET", `/v1/renders/${encodeURIComponent(renderId)}`, renderDetailSchema),
  });

export const createRender = (storyId: string, voiceId: string) =>
  requestJson("POST", "/v1/renders", renderSchema, createRenderRequestSchema.parse({ storyId, voiceId }));
