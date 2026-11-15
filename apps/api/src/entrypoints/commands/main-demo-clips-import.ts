import { readFile } from "node:fs/promises";

import { isStyle } from "@voice-storybook/shared/vocab";

import { composeDemoClipImport } from "../../composition-demo";

// 사용: demo:clips <style>=<녹음 파일> ... 예) calm=/tmp/s5/B_calm.m4a deep=/tmp/s5/B_deep2.m4a
// 경로에 =가 있어도 되도록 처음 =에서 한 번만 자른다.
const parseArgument = async (argument: string) => {
  const cut = argument.indexOf("=");
  const style = argument.slice(0, cut);
  const path = argument.slice(cut + 1);
  if (cut <= 0 || path === "" || !isStyle(style)) throw new Error(`style=파일 형식이 아니다: ${argument}`);
  return { style, audio: new Uint8Array(await readFile(path)) };
};

const files = await Promise.all(process.argv.slice(2).map(parseArgument));
if (files.length === 0) throw new Error("사용법: demo:clips <style>=<녹음 파일> ...");
const importer = await composeDemoClipImport(process.env);
const result = await importer.run(files).finally(importer.stop);
console.info(JSON.stringify(result, null, 2));
const allPassed = result.kind === "imported" && result.clips.every(({ kind }) => kind === "passed" || kind === "already_recorded");
process.exitCode = allPassed ? 0 : 1;
