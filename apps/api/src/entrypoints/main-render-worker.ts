import { composeRenderWorker } from "../composition-workers";

const { stop, lockLost } = await composeRenderWorker(process.env);

const shutdown = (): void => {
  void stop();
};

// 잠금을 잃은 워커는 다른 워커와 겹칠 수 있다. 멈추고 실패로 끝내 다시 띄우는 쪽(e2e-up)이 알게 한다.
void lockLost.then(async (error) => {
  console.error(JSON.stringify({ at: new Date().toISOString(), event: "lock_lost", detail: String(error) }));
  await stop().catch(() => undefined);
  process.exitCode = 1;
});

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
