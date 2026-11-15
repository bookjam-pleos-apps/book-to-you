import { isLoadFailed, type RefetchableQuery } from "../api-client/load-state";
import { LoadFailed, Loading } from "./controls";

// 아직 값이 없는 쿼리들의 자리다. 받는 중이면 로딩을, 실패했으면 실패한 것만 다시 받는 버튼을 보여 준다.
export const PendingLoads = ({ queries }: { readonly queries: readonly RefetchableQuery[] }) => {
  const failed = queries.filter(isLoadFailed);
  if (failed.length === 0) return <Loading />;
  return <LoadFailed onRetry={() => void Promise.all(failed.map((query) => query.refetch()))} />;
};
