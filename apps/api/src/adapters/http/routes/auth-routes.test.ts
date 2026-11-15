import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DAY_MS, HOUR_MS } from "../../../domain/identity/otp-limits";
import {
  createTestRuntime,
  inSequence,
  loginAs,
  postJson,
  sessionCookieOf,
  TEST_TERMS,
  type TestRuntime,
} from "../../../testing/test-runtime";
import { createAccountRepo } from "../../db/repos/account-repo";
import { consentRecords, otpCodes, users } from "../../db/schema";

const EMAIL = "parent@example.com";
const WRONG = "000000";

const request = (runtime: TestRuntime, email = EMAIL) => postJson(runtime, "/v1/auth/otp/request", { email });

const verify = (runtime: TestRuntime, code: string, overrides: object = {}) =>
  postJson(runtime, "/v1/auth/otp/verify", { email: EMAIL, code, ...TEST_TERMS, ...overrides });

const wrongCode = (runtime: TestRuntime): string => (runtime.mail.lastCode() === WRONG ? "000001" : WRONG);

const failTimes = async (runtime: TestRuntime, times: number): Promise<void> => {
  const code = wrongCode(runtime);
  await inSequence(times, () => verify(runtime, code));
};

describe("otp login", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime();
  });

  it("logs in with the mailed code and exposes the account through /v1/me", async () => {
    expect((await request(runtime)).status).toBe(202);
    const response = await verify(runtime, runtime.mail.lastCode());
    expect(response.status).toBe(200);
    const me = await runtime.app.request("/v1/me", { headers: { cookie: sessionCookieOf(response) } });
    expect(await me.json()).toMatchObject({ email: EMAIL });
  });

  it("stores only an hmac of the code", async () => {
    await request(runtime);
    const [row] = await runtime.database.select().from(otpCodes);
    expect(row?.codeHmac).not.toContain(runtime.mail.lastCode());
  });

  it("does not reveal whether an email has an account", async () => {
    await loginAs(runtime, "known@example.com");
    const known = await request(runtime, "known@example.com");
    const unknown = await request(runtime, "unknown@example.com");
    expect(known.status).toBe(unknown.status);
    expect(await known.text()).toBe(await unknown.text());
  });

  it("merges case variants of an email into one mailbox limit and account", async () => {
    await request(runtime, "Parent@Example.com");
    expect(runtime.mail.sent.at(-1)?.email).toBe(EMAIL);
    await verify(runtime, runtime.mail.lastCode(), { email: "PARENT@example.com" });
    expect(await runtime.database.select().from(users)).toHaveLength(1);
  });

  it("invalidates the previous code when a new one is issued", async () => {
    await request(runtime);
    const previous = runtime.mail.lastCode();
    await request(runtime);
    const latest = runtime.mail.lastCode();
    if (previous !== latest) expect((await verify(runtime, previous)).status).toBe(400);
    expect((await verify(runtime, latest)).status).toBe(200);
  });

  it("rejects an expired code", async () => {
    await request(runtime);
    runtime.advance(10 * 60_000);
    expect((await verify(runtime, runtime.mail.lastCode())).status).toBe(400);
  });

  it("does not accept a code twice", async () => {
    await request(runtime);
    const code = runtime.mail.lastCode();
    expect((await verify(runtime, code)).status).toBe(200);
    expect((await verify(runtime, code)).status).toBe(400);
  });

  it("locks a code after five failures even when the right code follows", async () => {
    await request(runtime);
    await failTimes(runtime, 5);
    const response = await verify(runtime, runtime.mail.lastCode());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too_many_attempts" });
  });

  it("limits requests per email per hour and recovers after the window", async () => {
    await inSequence(5, () => request(runtime));
    expect((await request(runtime)).status).toBe(429);
    runtime.advance(HOUR_MS);
    expect((await request(runtime)).status).toBe(202);
  });

  it("stops requests and attempts once daily failures reach the limit", async () => {
    await inSequence(4, async () => {
      await request(runtime);
      await failTimes(runtime, 5);
      runtime.advance(HOUR_MS);
    });
    expect((await request(runtime)).status).toBe(429);
    runtime.advance(DAY_MS);
    expect((await request(runtime)).status).toBe(202);
  });

  it("keeps counted failures when a new code invalidates the old one", async () => {
    await request(runtime);
    await failTimes(runtime, 3);
    await request(runtime);
    const rows = await runtime.database.select().from(otpCodes).where(eq(otpCodes.email, EMAIL));
    expect(rows.reduce((total, row) => total + row.attempts, 0)).toBe(3);
  });

  it("limits both otp routes per ip", async () => {
    await inSequence(30, () => verify(runtime, WRONG));
    expect((await request(runtime, "other@example.com")).status).toBe(429);
    runtime.advance(HOUR_MS);
    expect((await request(runtime, "other@example.com")).status).toBe(202);
  });

  it("rejects a malformed body", async () => {
    expect((await postJson(runtime, "/v1/auth/otp/request", { email: "nope" })).status).toBe(400);
    expect((await verify(runtime, "12ab56")).status).toBe(400);
  });

  it("writes one account terms receipt on first login only", async () => {
    await loginAs(runtime, EMAIL);
    runtime.advance(HOUR_MS);
    await loginAs(runtime, EMAIL);
    const receipts = await runtime.database.select().from(consentRecords);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ kind: "account_terms", status: "active", termsVersion: "2026-11" });
  });

  it("records a new receipt when an existing user accepts revised terms", async () => {
    const accounts = createAccountRepo(runtime.database);
    const now = runtime.clock();
    const first = await accounts.findOrRegister({ email: EMAIL, ...TEST_TERMS, now });
    const second = await accounts.findOrRegister({ email: EMAIL, ...TEST_TERMS, termsVersion: "2027-01", now });
    await accounts.findOrRegister({ email: EMAIL, ...TEST_TERMS, termsVersion: "2027-01", now });
    expect(second).toBe(first);
    const receipts = await runtime.database.select().from(consentRecords);
    expect(receipts.map((row) => row.termsVersion).toSorted()).toEqual(["2026-11", "2027-01"]);
  });

  it("tells a client which terms versions to show without a session", async () => {
    const response = await runtime.app.request("/v1/terms");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(TEST_TERMS);
  });

  it("rejects outdated terms without spending an attempt", async () => {
    await request(runtime);
    const response = await verify(runtime, runtime.mail.lastCode(), { termsVersion: "old" });
    expect(await response.json()).toEqual({ error: "terms_outdated" });
    const [row] = await runtime.database.select().from(otpCodes);
    expect(row?.attempts).toBe(0);
    expect((await verify(runtime, runtime.mail.lastCode())).status).toBe(200);
  });

  it("ends the session on logout", async () => {
    const cookie = await loginAs(runtime, EMAIL);
    const logout = await postJson(runtime, "/v1/auth/logout", {}, { cookie });
    expect(logout.status).toBe(204);
    expect((await runtime.app.request("/v1/me", { headers: { cookie } })).status).toBe(401);
  });

  it("expires the session", async () => {
    const cookie = await loginAs(runtime, EMAIL);
    runtime.advance(30 * DAY_MS);
    expect((await runtime.app.request("/v1/me", { headers: { cookie } })).status).toBe(401);
  });
});
