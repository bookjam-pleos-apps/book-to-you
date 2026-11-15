import { CLIP_ADVICES, CLIP_FAILURES, PROMPT_KINDS, STYLES } from "@voice-storybook/shared/vocab";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

export const styleEnum = pgEnum("style", STYLES);
export const consentKindEnum = pgEnum("consent_kind", ["account_terms", "speaker_voice"]);
export const consentStatusEnum = pgEnum("consent_status", ["checking", "active", "revoked"]);
export const promptKindEnum = pgEnum("prompt_kind", PROMPT_KINDS);
export const clipStatusEnum = pgEnum("clip_status", ["checking", "passed", "failed"]);
export const clipFailureEnum = pgEnum("clip_failure", CLIP_FAILURES);
export const clipAdviceEnum = pgEnum("clip_advice", CLIP_ADVICES);

// 동의 영수증은 계정과 음성을 지운 뒤에도 남는다. 그래서 voice_profile_id는 FK가 아니고 user_id는 SET NULL이다.
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: consentKindEnum("kind").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    voiceProfileId: uuid("voice_profile_id"),
    speakerLabel: text("speaker_label"),
    termsVersion: text("terms_version").notNull(),
    aiNoticeVersion: text("ai_notice_version").notNull(),
    phrase: text("phrase"),
    phraseAudioSha256: text("phrase_audio_sha256"),
    matchScore: real("match_score"),
    // 기본값을 두지 않는다. 값을 빠뜨린 INSERT가 활성 동의가 되면 안 된다.
    status: consentStatusEnum("status").notNull(),
    givenAt: timestamp("given_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    retainUntil: timestamp("retain_until", { withTimezone: true }),
  },
  (table) => [
    // ADD VALUE로 넣은 'checking'은 같은 트랜잭션에서 쓸 수 없어 <> 'revoked'로 적는다.
    uniqueIndex("consent_one_live_per_voice")
      .on(table.voiceProfileId)
      .where(sql`${table.kind} = 'speaker_voice' AND ${table.status} <> 'revoked'`),
    uniqueIndex("consent_one_terms_receipt_per_version")
      .on(table.userId, table.termsVersion, table.aiNoticeVersion)
      .where(sql`${table.kind} = 'account_terms'`),
  ],
);

export const voiceProfiles = pgTable(
  "voice_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    activeConsentId: uuid("active_consent_id").references(() => consentRecords.id, {
      onDelete: "set null",
    }),
    // 차량이 처음 고를 목소리다. users에 FK로 두면 음성 삭제가 users를 갱신해 잠금 순서(사용자 → 음성)가 뒤집힌다.
    isDefault: boolean("is_default").notNull().default(false),
  },
  (table) => [
    index("voice_profiles_user_idx").on(table.userId),
    uniqueIndex("voice_profiles_one_default").on(table.userId).where(sql`${table.isDefault}`),
  ],
);

export const voiceClips = pgTable(
  "voice_clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voiceProfileId: uuid("voice_profile_id")
      .notNull()
      .references(() => voiceProfiles.id, { onDelete: "cascade" }),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => consentRecords.id, { onDelete: "cascade" }),
    style: styleEnum("style").notNull(),
    scriptId: text("script_id").notNull(),
    scriptVersion: text("script_version").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    durationMs: integer("duration_ms").notNull(),
    status: clipStatusEnum("status").notNull().default("checking"),
    signal: jsonb("signal"),
    cer: real("cer"),
    // 음높이 중앙값과 말 속도다. calm의 값은 다른 style이 구별되는지 볼 때 기준점이 된다.
    // checking인데 값이 있으면 대본은 통과했고 기준점(통과한 calm)을 기다리는 녹음이다.
    prosody: jsonb("prosody"),
    failure: clipFailureEnum("failure"),
    // 통과했지만 더 잘 읽을 여지가 있는 녹음이다. 같은 style의 새 녹음이 통과하면 이 녹음은 지워진다.
    advice: clipAdviceEnum("advice"),
  },
  (table) => [index("voice_clips_profile_idx").on(table.voiceProfileId)],
);

export const voiceHandles = pgTable(
  "voice_handles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clipId: uuid("clip_id")
      .notNull()
      .references(() => voiceClips.id, { onDelete: "cascade" }),
    engineId: text("engine_id").notNull(),
    modelRev: text("model_rev").notNull(),
    key: text("key").notNull(),
  },
  (table) => [unique("voice_handles_clip_engine_unique").on(table.clipId, table.engineId, table.modelRev)],
);

export const voicePrompts = pgTable(
  "voice_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voiceProfileId: uuid("voice_profile_id")
      .notNull()
      .references(() => voiceProfiles.id, { onDelete: "cascade" }),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => consentRecords.id, { onDelete: "cascade" }),
    kind: promptKindEnum("kind").notNull(),
    scriptId: text("script_id").notNull(),
    scriptVersion: text("script_version").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    durationMs: integer("duration_ms").notNull(),
    bytes: integer("bytes").notNull(),
    signal: jsonb("signal"),
  },
  (table) => [unique("voice_prompts_voice_kind_unique").on(table.voiceProfileId, table.kind)],
);
