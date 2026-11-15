import { describe, expect, it } from "vitest";

import { readPhraseToken, signPhraseToken } from "./phrase-token";

const CLAIMS = { voiceId: "voice-1", phrase: "파란 사과 두 개", expiresAtMs: 1000 };

describe("consent phrase token", () => {
  it("round-trips a korean phrase before it expires", () => {
    expect(readPhraseToken("secret", signPhraseToken("secret", CLAIMS), 999)).toEqual(CLAIMS);
  });

  it("rejects an expired token", () => {
    expect(readPhraseToken("secret", signPhraseToken("secret", CLAIMS), 1000)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    expect(readPhraseToken("other", signPhraseToken("secret", CLAIMS), 0)).toBeNull();
  });

  it("rejects a token for another voice or phrase", () => {
    const token = signPhraseToken("secret", CLAIMS);
    expect(readPhraseToken("secret", token.replace("voice-1", "voice-2"), 0)).toBeNull();
    const phrasePart = token.split(".")[2] ?? "";
    expect(readPhraseToken("secret", token.replace(phrasePart, "AAAA"), 0)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(readPhraseToken("secret", "garbage", 0)).toBeNull();
    expect(readPhraseToken("secret", "a.b.c.d.e", 0)).toBeNull();
  });
});
