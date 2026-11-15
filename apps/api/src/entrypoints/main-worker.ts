import { composeWorker } from "../composition-workers";

const { stop } = await composeWorker(process.env);

const shutdown = (): void => {
  void stop();
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
