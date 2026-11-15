import { composeDemoTransfer } from "../../composition-demo";

const [voiceId, path] = process.argv.slice(2);
if (voiceId === undefined || path === undefined) throw new Error("사용법: demo:export <voiceId> <bundle.json>");
const transfer = await composeDemoTransfer(process.env);
const result = await transfer.exportTo(voiceId, path).finally(transfer.stop);
console.info(JSON.stringify(result));
process.exitCode = result.kind === "exported" ? 0 : 1;
