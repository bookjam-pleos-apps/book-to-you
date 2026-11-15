import { describe, expect, it } from "vitest";

import { clipKey, consentAudioKey, consentIdOfKey, userPrefix, voicePrefix } from "./storage-keys";

const ID = "00000000-0000-4000-8000-000000000001";

describe("storage keys", () => {
  it("keeps every object of a voice under its prefix and every voice under its user", () => {
    expect(clipKey("u1", "v1", "c1").startsWith(voicePrefix("u1", "v1"))).toBe(true);
    expect(voicePrefix("u1", "v1").startsWith(userPrefix("u1"))).toBe(true);
  });

  it("does not let one user's prefix match another's", () => {
    expect(userPrefix("u1").endsWith("/")).toBe(true);
    expect(userPrefix("u11").startsWith(userPrefix("u1"))).toBe(false);
  });

  it("finds the consent id only in a consent audio key", () => {
    expect(consentIdOfKey(consentAudioKey("u", "v", ID))).toBe(ID);
    expect(consentIdOfKey(clipKey("u", "v", ID))).toBeNull();
  });
});
