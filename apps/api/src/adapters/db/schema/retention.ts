import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// CASCADE와 같은 트랜잭션에 쓴다. voice_handles가 지워진 뒤에는 GPU 캐시 키를 되찾을 수 없다.
export const pendingPurges = pgTable("pending_purges", {
  id: uuid("id").primaryKey().defaultRandom(),
  storagePrefix: text("storage_prefix").notNull(),
  engineKeys: text("engine_keys").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
