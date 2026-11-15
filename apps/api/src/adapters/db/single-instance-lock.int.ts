import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { acquireSingleInstanceLock } from "./single-instance-lock";

const URL = process.env.DATABASE_URL ?? "";
const KEY = 0x7465_7374;

describe("single instance lock", () => {
  it("lets only one holder in and frees the key when the holder leaves", async () => {
    const first = await acquireSingleInstanceLock(URL, KEY);
    const second = await acquireSingleInstanceLock(URL, KEY);
    expect([first === null, second]).toEqual([false, null]);
    await first?.release();
    const third = await acquireSingleInstanceLock(URL, KEY);
    expect(third).not.toBeNull();
    await third?.release();
  });

  it("reports a lost lock instead of crashing when the server drops the connection", async () => {
    const held = await acquireSingleInstanceLock(URL, KEY);
    const admin = new Client({ connectionString: URL });
    await admin.connect();
    await admin.query("select pg_terminate_backend(pid) from pg_locks where locktype = 'advisory' and objid = $1", [KEY]);
    await admin.end();
    await expect(held?.lost).resolves.toBeInstanceOf(Error);
    const next = await acquireSingleInstanceLock(URL, KEY);
    expect(next).not.toBeNull();
    await next?.release();
  });
});
