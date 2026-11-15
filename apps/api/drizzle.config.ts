import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/adapters/db/schema/index.ts",
  out: "./drizzle",
});
