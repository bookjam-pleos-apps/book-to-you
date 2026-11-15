import { describe, expect, it } from "vitest";

import { orderShelf } from "./shelf-order";

const entry = (voiceId: string, voiceLabel: string, storyId: string) => ({ voiceId, voiceLabel, storyId });

const MOM = (storyId: string) => entry("v-z", "엄마", storyId);
const DAD = (storyId: string) => entry("v-a", "아빠", storyId);

describe("orderShelf", () => {
  const entries = [MOM("s-2"), DAD("s-2"), MOM("s-1"), DAD("s-1")];

  it("puts the default voice first, then orders by voice name and story", () => {
    expect(orderShelf(entries, "v-z")).toEqual([MOM("s-1"), MOM("s-2"), DAD("s-1"), DAD("s-2")]);
  });

  it("orders voices by the name the parent gave, not by id, when there is no default", () => {
    expect(orderShelf(entries, null)).toEqual([DAD("s-1"), DAD("s-2"), MOM("s-1"), MOM("s-2")]);
  });

  it("keeps two voices with the same name on separate shelves", () => {
    const twins = [entry("v-b", "엄마", "s-1"), entry("v-a", "엄마", "s-2"), entry("v-b", "엄마", "s-2")];
    expect(orderShelf(twins, null).map((item) => item.voiceId)).toEqual(["v-a", "v-b", "v-b"]);
  });

  it("keeps the order when the default voice has no story yet", () => {
    expect(orderShelf(entries, "v-new")).toEqual(orderShelf(entries, null));
  });

  it("does not reorder the input", () => {
    const input = [MOM("s-1"), DAD("s-1")];
    orderShelf(input, null);
    expect(input).toEqual([MOM("s-1"), DAD("s-1")]);
  });
});
