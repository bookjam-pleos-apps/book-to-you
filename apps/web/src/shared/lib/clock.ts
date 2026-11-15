export const formatClock = (ms: number): string => {
  const total = Math.floor(ms / 1_000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

// 브라우저가 MediaRecorder 녹음의 길이를 Infinity로 주기도 해서, 길이는 녹음할 때 잰 값을 받는다.
export const playbackPercent = (positionMs: number, durationMs: number): number => {
  if (durationMs <= 0) return 0;
  return Math.min(100, Math.max(0, (positionMs / durationMs) * 100));
};
