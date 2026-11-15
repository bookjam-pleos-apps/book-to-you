import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { devices } from "./devices";
import { users } from "./identity";
import { renders } from "./renders";

// 같은 기기가 같은 이야기를 같은 사유로 다시 신고해도 한 건이다. 렌더가 지워져도 무엇을 신고했는지 남도록 story_id를 따로 둔다.
export const storyReports = pgTable(
  "story_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    renderId: uuid("render_id").references(() => renders.id, { onDelete: "set null" }),
    storyId: text("story_id").notNull(),
    voiceId: uuid("voice_id"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("story_reports_render_idx").on(table.renderId),
    unique("story_reports_once").on(table.userId, table.deviceId, table.renderId, table.reason).nullsNotDistinct(),
  ],
);
