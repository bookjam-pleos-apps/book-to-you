import { CHAPTER_ROLES } from "@voice-storybook/shared/vocab";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RenderFailureCode } from "../../../domain/renders/render-failure";
import { users } from "./identity";
import { voiceProfiles } from "./voices";

export const renderStatusEnum = pgEnum("render_status", ["queued", "running", "succeeded", "failed"]);
export const chapterRoleEnum = pgEnum("chapter_role", CHAPTER_ROLES);

export const renders = pgTable(
  "renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    voiceProfileId: uuid("voice_profile_id")
      .notNull()
      .references(() => voiceProfiles.id, { onDelete: "cascade" }),
    storyId: text("story_id").notNull(),
    storyVersion: text("story_version").notNull(),
    renderKey: text("render_key").notNull(),
    refClipIds: uuid("ref_clip_ids").array().notNull(),
    engineId: text("engine_id").notNull(),
    engineVersion: text("engine_version").notNull(),
    status: renderStatusEnum("status").notNull().default("queued"),
    chaptersDone: integer("chapters_done").notNull().default(0),
    chaptersTotal: integer("chapters_total").notNull(),
    errorCode: text("error_code").$type<RenderFailureCode>(),
    // 운영자 배치는 가져간 횟수, 렌더 워커는 장비에 제출한 횟수다(engineSubmittedAt이 있는 행). 워커는 이것으로 다시 제출할지 정한다.
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // 렌더 워커가 잡은 행이다. 워커가 다시 떠도 이 task부터 조회하고, 운영자의 --resume은 이 행을 거부한다.
    // 렌더가 끝나도 장비의 작업 폴더를 지울 때까지 남는다.
    engineTaskId: text("engine_task_id"),
    engineSubmittedAt: timestamp("engine_submitted_at", { withTimezone: true }),
  },
  (table) => [
    // 실패한 렌더는 같은 키로 다시 만들 수 있어야 한다.
    uniqueIndex("renders_key_unless_failed")
      .on(table.renderKey)
      .where(sql`${table.status} <> 'failed'`),
    index("renders_user_idx").on(table.userId),
  ],
);

export const renderChapters = pgTable(
  "render_chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    renderId: uuid("render_id")
      .notNull()
      .references(() => renders.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    role: chapterRoleEnum("role").notNull(),
    title: text("title"),
    storageKey: text("storage_key").notNull(),
    durationMs: integer("duration_ms").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
  },
  (table) => [unique("render_chapters_render_index_unique").on(table.renderId, table.index)],
);
