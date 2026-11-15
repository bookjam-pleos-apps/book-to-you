type Task<Result> = () => Promise<Result>;

export const createConcurrencyLimit = (maxRunning: number) => {
  const waiting: (() => void)[] = [];
  const state = { running: 0 };
  const release = (): void => {
    state.running -= 1;
    waiting.shift()?.();
  };
  const acquire = (): Promise<void> => {
    if (state.running < maxRunning) {
      state.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waiting.push(() => {
        state.running += 1;
        resolve();
      });
    });
  };
  return async <Result>(task: Task<Result>): Promise<Result> => {
    await acquire();
    return task().finally(release);
  };
};
