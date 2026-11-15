import { describe, expect, it } from "vitest";

import { judgePairingPoll, type DevicePairing } from "./pairing-code";

const INTERVAL_MS = 5000;
const NOW_MS = 100_000;
const waiting: DevicePairing = {
  expiresAtMs: NOW_MS + 60_000,
  confirmedAtMs: null,
  consumedAtMs: null,
  lastPolledAtMs: null,
};
const confirmed: DevicePairing = { ...waiting, confirmedAtMs: NOW_MS - 1000 };

describe("judgePairingPoll", () => {
  it("keeps the device waiting until the parent confirms", () => {
    expect(judgePairingPoll(waiting, NOW_MS, INTERVAL_MS)).toBe("authorization_pending");
  });

  it("issues a token once confirmed", () => {
    expect(judgePairingPoll(confirmed, NOW_MS, INTERVAL_MS)).toBe("issue_token");
  });

  it("tells a device polling too fast to slow down", () => {
    const tooFast = { ...waiting, lastPolledAtMs: NOW_MS - 1000 };
    expect(judgePairingPoll(tooFast, NOW_MS, INTERVAL_MS)).toBe("slow_down");
  });

  it("allows a poll exactly at the interval", () => {
    const onTime = { ...waiting, lastPolledAtMs: NOW_MS - INTERVAL_MS };
    expect(judgePairingPoll(onTime, NOW_MS, INTERVAL_MS)).toBe("authorization_pending");
  });

  it("reports expiry for an unconfirmed code", () => {
    expect(judgePairingPoll({ ...waiting, expiresAtMs: NOW_MS }, NOW_MS, INTERVAL_MS)).toBe("expired_token");
  });

  it("never issues a second token from a consumed code", () => {
    const consumed = { ...confirmed, consumedAtMs: NOW_MS - 500 };
    expect(judgePairingPoll(consumed, NOW_MS, INTERVAL_MS)).toBe("invalid_grant");
  });

  it("reports a consumed code as invalid even after it expires", () => {
    const consumed = { ...confirmed, consumedAtMs: NOW_MS - 500, expiresAtMs: NOW_MS };
    expect(judgePairingPoll(consumed, NOW_MS, INTERVAL_MS)).toBe("invalid_grant");
  });

  it("does not issue a token after expiry even if confirmed", () => {
    expect(judgePairingPoll({ ...confirmed, expiresAtMs: NOW_MS }, NOW_MS, INTERVAL_MS)).toBe("expired_token");
  });

  it("issues a confirmed token even when polling too fast", () => {
    const tooFast = { ...confirmed, lastPolledAtMs: NOW_MS - 1000 };
    expect(judgePairingPoll(tooFast, NOW_MS, INTERVAL_MS)).toBe("issue_token");
  });
});
