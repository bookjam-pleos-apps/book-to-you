import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const LIB = resolve(import.meta.dirname, "../../scripts/lib/e2e-common.sh");

const pickServicePids = (psOutput: string): readonly string[] =>
  execFileSync("bash", ["-c", `. "${LIB}" && pick_service_pids`], { input: psOutput, encoding: "utf8" })
    .split("\n")
    .filter((line) => line.length > 0);

const VENV = "/home/user/voice-storybook-api/voice-clone/.venv/bin/python3";

describe("pick_service_pids", () => {
  it("전사 서비스의 부모와 whisper 자식만 고르고 셸·남의 프로세스는 뺀다", () => {
    const ps = [
      `  100     1 uv run --locked model-compose up`,
      `  101   100 ${VENV} /home/user/voice-storybook-api/voice-clone/.venv/bin/model-compose up`,
      `  102   101 ${VENV} -c from multiprocessing.spawn import spawn_main; spawn_main(tracker_fd=5)`,
      `  200   199 bash -c ps -u user -o pid=,ppid=,args= | grep voice-storybook-api/voice-clone/.venv/`,
      `  201   199 /usr/bin/grep voice-storybook-api/voice-clone/.venv/`,
      `  300     1 /home/user/voice-storybook-clone/gpu/spike/.venv/bin/python -m spike.run_render_job`,
      `  400     1 /home/user/tongyeok/eval/.venv/bin/python serve.py`,
    ].join("\n");

    expect(pickServicePids(ps)).toEqual(["101", "102"]);
  });

  it("서비스가 없으면 아무것도 고르지 않는다", () => {
    expect(pickServicePids("  400     1 /home/user/tongyeok/eval/.venv/bin/python serve.py\n")).toEqual([]);
  });
});
