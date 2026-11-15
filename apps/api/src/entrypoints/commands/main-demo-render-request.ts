import { composeDemoRenderRequest } from "../../composition-demo";

// 사용: demo:renders <storyId> ... 예) redhood fisherman masteraway
const storyIds = process.argv.slice(2);
if (storyIds.length === 0) throw new Error("사용법: demo:renders <storyId> ...");
const requester = await composeDemoRenderRequest(process.env);
const result = await requester.run(storyIds).finally(requester.stop);
console.info(JSON.stringify(result, null, 2));
const allQueued = result.kind === "requested" && result.renders.every(({ result: render }) => render.kind === "queued" || render.kind === "existing");
process.exitCode = allQueued ? 0 : 1;
