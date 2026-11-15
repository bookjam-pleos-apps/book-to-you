import { composeDemoTransfer } from "../../composition-demo";

const [path] = process.argv.slice(2);
if (path === undefined) throw new Error("사용법: demo:import <bundle.json>");
const transfer = await composeDemoTransfer(process.env);
const result = await transfer.importFrom(path).finally(transfer.stop);
console.info(JSON.stringify(result));
process.exitCode = result.kind === "imported" ? 0 : 1;
