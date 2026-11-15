import { composeRenderBatch } from "../../composition-workers";
import { parseBatchCommand, type BatchCommand } from "../../adapters/cli/batch-command";

type Batch = Awaited<ReturnType<typeof composeRenderBatch>>;

const run = (batch: Batch, command: BatchCommand) => {
  if (command.kind === "start") return batch.start(command.input, command.jobDirectory);
  if (command.kind === "publish") return batch.publish(command.jobDirectory);
  if (command.kind === "queued") return batch.queued().then((renders) => ({ kind: "queued" as const, renders }));
  return batch.abandon(command.renderId);
};

const succeeded = (result: Awaited<ReturnType<typeof run>>): boolean =>
  result.kind === "started" || result.kind === "published" || result.kind === "queued" || (result.kind === "abandon" && result.abandoned);

const command = parseBatchCommand(process.argv.slice(2));
const batch = await composeRenderBatch(process.env);
const result = await run(batch, command).finally(batch.stop);
console.info(JSON.stringify(result));
process.exitCode = succeeded(result) ? 0 : 1;
