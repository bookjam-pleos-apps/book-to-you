import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createSecretToken, hashSecretToken } from "./secret-token";

describe("secret token", () => {
  it("encodes the random bytes as a url-safe token", () => {
    expect(createSecretToken(randomBytes)).toMatch(/^[\w-]{43}$/);
    expect(createSecretToken(() => new Uint8Array([251, 255]))).toBe("-_8");
  });

  it("hashes to a stable value that does not contain the token", () => {
    const token = createSecretToken(randomBytes);
    expect(hashSecretToken(token)).toBe(hashSecretToken(token));
    expect(hashSecretToken(token)).not.toContain(token);
  });
});
