import { describe, expect, it } from "vitest";

import { clientAddress, ipRateLimitKey } from "./client-ip";

describe("client address", () => {
  it("uses the proxy-appended value and ignores spoofed left values", () => {
    expect(clientAddress("6.6.6.6, 1.2.3.4", "10.0.0.1", true)).toBe("1.2.3.4");
  });

  it("ignores forwarded headers without a trusted proxy", () => {
    expect(clientAddress("1.2.3.4", "10.0.0.1", false)).toBe("10.0.0.1");
  });

  it("falls back to the remote address when the header is missing", () => {
    expect(clientAddress(undefined, "10.0.0.1", true)).toBe("10.0.0.1");
  });
});

describe("rate limit key", () => {
  it("groups IPv6 addresses by /64", () => {
    expect(ipRateLimitKey("2001:db8:1:2:aaaa::1")).toBe(ipRateLimitKey("2001:db8:1:2:bbbb::2"));
    expect(ipRateLimitKey("2001:db8:1:2::1")).not.toBe(ipRateLimitKey("2001:db8:1:3::1"));
  });

  it("treats an IPv4-mapped address like IPv4", () => {
    expect(ipRateLimitKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
  });

  it("expands a compressed loopback", () => {
    expect(ipRateLimitKey("::1")).toBe("0:0:0:0");
  });
});
