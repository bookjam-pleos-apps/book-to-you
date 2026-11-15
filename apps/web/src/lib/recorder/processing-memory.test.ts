import { describe, expect, it } from "vitest";

import type { KeyValueStore } from "../browser/storage";
import { readProcessing, rememberProcessing } from "./processing-memory";

const memoryStore = (): KeyValueStore => {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
};

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("mic processing memory", () => {
  it("starts with processing off on a device that never had a silent take", () => {
    expect(readProcessing(memoryStore())).toBe("off");
    expect(readProcessing(null)).toBe("off");
  });

  it("opens the next script with browser processing once this device recorded silence", () => {
    const store = memoryStore();
    rememberProcessing(store, "browser");
    expect(readProcessing(store)).toBe("browser");
  });

  it("falls back to off when storage is blocked instead of breaking the recorder", () => {
    expect(() => rememberProcessing(throwingStore, "browser")).not.toThrow();
    expect(readProcessing(throwingStore)).toBe("off");
  });
});
