export type PollingOptions<Memory> = {
  readonly initial: Memory;
  readonly intervalMs: number;
  readonly onError: (error: unknown) => void;
};

type PollingLoop<Memory> = { memory: Memory; timer: NodeJS.Timeout | undefined; current: Promise<void>; stopped: boolean };

// 주기가 겹치지 않게 앞 주기가 끝난 뒤에 다음을 예약한다. 멈출 때는 도는 주기가 끝나기를 기다린다.
// 주기가 실패해도 기억(memory)은 그대로 두고 다음 주기를 이어 간다.
export const startPolling = <Memory>(tick: (memory: Memory, now: Date) => Promise<Memory>, { initial, intervalMs, onError }: PollingOptions<Memory>) => {
  const loop: PollingLoop<Memory> = { memory: initial, timer: undefined, current: Promise.resolve(), stopped: false };
  const run = (): void => {
    loop.current = tick(loop.memory, new Date())
      .then((memory) => { loop.memory = memory; })
      .catch(onError)
      .finally(() => { if (!loop.stopped) loop.timer = setTimeout(run, intervalMs); });
  };
  run();
  return {
    stop: async (): Promise<void> => {
      loop.stopped = true;
      clearTimeout(loop.timer);
      await loop.current;
    },
  };
};
