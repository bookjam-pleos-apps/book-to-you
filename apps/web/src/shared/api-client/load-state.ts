export type LoadedQuery = { readonly data: unknown; readonly isError: boolean };

export type RefetchableQuery = LoadedQuery & { readonly refetch: () => Promise<unknown> };

// 받아 둔 값이 있으면 다시 받기에 실패해도 그 값을 계속 보여 준다. 값이 없는데 실패했을 때만 다시 시도를 띄운다.
export const isLoadFailed = (query: LoadedQuery): boolean => query.data === undefined && query.isError;
