import { defineConfig } from "vitest/config";

import { intDatabaseUrl } from "./apps/api/src/testing/int-database";

const INT_BUCKET_SUFFIX = "-int-test";

export default defineConfig({
  test: {
    include: ["apps/**/*.int.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
    globalSetup: ["./apps/api/src/testing/int-database.ts"],
    env: {
      DATABASE_URL: intDatabaseUrl(process.env.DATABASE_URL ?? ""),
      S3_BUCKET: `${process.env.S3_BUCKET ?? ""}${INT_BUCKET_SUFFIX}`,
    },
  },
});
