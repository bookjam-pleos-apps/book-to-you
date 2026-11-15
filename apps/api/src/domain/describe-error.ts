// DB 오류는 원인(cause)에만 실제 이유(없는 칸 등)가 있다. 한 줄에 원인까지 붙인다.
export const describeError = (error: unknown): string => {
  const message = error instanceof Error ? `${error.name}: ${error.message.split("\n")[0] ?? ""}` : String(error);
  return error instanceof Error && error.cause !== undefined ? `${message} <- ${describeError(error.cause)}` : message;
};
