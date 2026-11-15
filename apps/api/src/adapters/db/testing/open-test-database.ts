import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../schema";

const MIGRATIONS = resolve(import.meta.dirname, "../../../../drizzle");

export const openTestDatabase = async () => {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: MIGRATIONS });
  return database;
};

export type TestDatabase = Awaited<ReturnType<typeof openTestDatabase>>;
