import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import * as schema from "./schema";

const MIGRATIONS = resolve(import.meta.dirname, "../../../drizzle");

export const POOL_APPLICATION_NAME = "voice-storybook-api";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DatabaseConnection = {
  readonly database: Database;
  readonly migrate: () => Promise<void>;
  readonly close: () => Promise<void>;
};

export const connectDatabase = (connectionString: string): DatabaseConnection => {
  const pool = new Pool({ connectionString, application_name: POOL_APPLICATION_NAME });
  // 처리기가 없으면 Postgres 재시작 때 유휴 연결 오류로 프로세스가 죽는다. Pool은 다음 쿼리에서 다시 연결한다.
  pool.on("error", (error) => console.error("[db] idle connection error", error));
  const database = drizzle(pool, { schema });
  return {
    database,
    migrate: () => migrate(database, { migrationsFolder: MIGRATIONS }),
    close: () => pool.end(),
  };
};
