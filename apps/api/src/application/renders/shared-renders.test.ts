import { describe, expect, it } from "vitest";

import type { RenderListItem } from "./list-renders";
import { withSharedRenders } from "./shared-renders";

const item = (renderId: string, status: RenderListItem["status"]): RenderListItem => ({
  renderId,
  storyId: renderId,
  title: renderId,
  voiceId: "v",
  voiceLabel: "엄마",
  status,
  shared: false,
});

const LISTS: Record<string, readonly RenderListItem[]> = {
  demo: [item("demo-ready", "playable"), item("demo-making", "making"), item("demo-failed", "failed")],
  parent: [item("own-making", "making")],
};

const list = withSharedRenders(async (userId) => LISTS[userId] ?? [], "demo");

describe("withSharedRenders", () => {
  it("adds only the demo account's playable stories, marked shared, after the parent's own", async () => {
    expect((await list("parent")).map(({ renderId, shared }) => [renderId, shared])).toEqual([
      ["own-making", false],
      ["demo-ready", true],
    ]);
  });

  it("leaves the demo account's own list as it is", async () => {
    expect((await list("demo")).map(({ renderId, shared }) => [renderId, shared])).toEqual([
      ["demo-ready", false],
      ["demo-making", false],
      ["demo-failed", false],
    ]);
  });
});
