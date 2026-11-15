import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestOtp, verifyOtp } from "../../../application/identity";
import { connectDatabase } from "../client";
import { otpCodes, users } from "../schema";
import { createAccountRepo } from "./account-repo";
import { createOtpRepo } from "./otp-repo";
import { createSessionRepo } from "./session-repo";

const SECRET = "integration-secret";
const LIMITS = { requestsPerHour: 100, failuresPerDay: 1000 };
const VERSIONS = { termsVersion: "1", aiNoticeVersion: "1" };

const connection = connectDatabase(process.env.DATABASE_URL ?? "");
const { database } = connection;
const otps = createOtpRepo(database);
const clock = () => new Date();

const verifier = verifyOtp({
  otps,
  accounts: createAccountRepo(database),
  sessions: createSessionRepo(database),
  clock,
  secret: SECRET,
  limits: LIMITS,
  sessionTtlMs: 60_000,
  ...VERSIONS,
});

const issueCode = async (email: string): Promise<string> => {
  const captured: string[] = [];
  const send = requestOtp({
    otps,
    clock,
    secret: SECRET,
    ttlMs: 60_000,
    limits: LIMITS,
    mailer: { sendOtp: async (_, code) => void captured.push(code) },
  });
  await send(email);
  return captured[0] ?? "";
};

describe("otp under real concurrency", () => {
  beforeAll(() => connection.migrate());
  afterAll(() => connection.close());

  it("never spends more than five attempts when verify calls race", async () => {
    const email = `race-${randomUUID()}@example.com`;
    const code = await issueCode(email);
    const wrong = code === "000000" ? "000001" : "000000";
    const results = await Promise.all(Array.from({ length: 40 }, () => verifier({ email, code: wrong, ...VERSIONS })));
    const [row] = await database.select().from(otpCodes).where(eq(otpCodes.email, email));
    expect(row?.attempts).toBe(5);
    expect(results.filter((result) => result.kind === "too_many_attempts")).toHaveLength(35);
    expect((await verifier({ email, code, ...VERSIONS })).kind).toBe("too_many_attempts");
  });

  it("logs in once when the right code races with itself", async () => {
    const email = `once-${randomUUID()}@example.com`;
    const code = await issueCode(email);
    const results = await Promise.all(Array.from({ length: 10 }, () => verifier({ email, code, ...VERSIONS })));
    expect(results.filter((result) => result.kind === "ok")).toHaveLength(1);
  });

  it("leaves one live code when requests race", async () => {
    const email = `live-${randomUUID()}@example.com`;
    await Promise.all(Array.from({ length: 10 }, () => issueCode(email)));
    const live = await database.select().from(otpCodes).where(eq(otpCodes.email, email));
    expect(live.filter((row) => row.consumedAt === null)).toHaveLength(1);
    expect(live).toHaveLength(10);
  });

  it("creates one user when first logins race", async () => {
    const email = `user-${randomUUID()}@example.com`;
    const accounts = createAccountRepo(database);
    const now = new Date();
    await Promise.all(Array.from({ length: 8 }, () => accounts.findOrRegister({ email, ...VERSIONS, now })));
    expect(await database.select().from(users).where(eq(users.email, email))).toHaveLength(1);
  });
});
