import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { connectDatabase, POOL_APPLICATION_NAME } from "./client";

const connection = connectDatabase(process.env.DATABASE_URL ?? "");
const admin = connectDatabase(process.env.DATABASE_URL ?? "");

describe("database connection", () => {
  afterAll(async () => {
    await connection.close();
    await admin.close();
  });

  it("survives Postgres dropping an idle connection and reconnects", async () => {
    await connection.database.execute(sql`SELECT 1`);
    await admin.database.execute(
      sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE application_name = ${POOL_APPLICATION_NAME} AND pid <> pg_backend_pid() AND state = 'idle'`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(connection.database.execute(sql`SELECT 1`)).resolves.toBeDefined();
  });
});
