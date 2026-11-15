CREATE TYPE "public"."chapter_role" AS ENUM('intro', 'body', 'ending');--> statement-breakpoint
CREATE TYPE "public"."render_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."clip_status" AS ENUM('checking', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('account_terms', 'speaker_voice');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."style" AS ENUM('calm', 'excited', 'soft');--> statement-breakpoint
CREATE TABLE "device_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code" text NOT NULL,
	"device_name" text NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	CONSTRAINT "device_pairings_device_code_hash_unique" UNIQUE("device_code_hash"),
	CONSTRAINT "device_pairings_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hmac" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "render_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"render_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"role" "chapter_role" NOT NULL,
	"storage_key" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "render_chapters_render_index_unique" UNIQUE("render_id","index")
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"story_id" text NOT NULL,
	"story_version" text NOT NULL,
	"render_key" text NOT NULL,
	"ref_clip_ids" uuid[] NOT NULL,
	"engine_id" text NOT NULL,
	"engine_version" text NOT NULL,
	"status" "render_status" DEFAULT 'queued' NOT NULL,
	"chapters_done" integer DEFAULT 0 NOT NULL,
	"chapters_total" integer NOT NULL,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"user_id" uuid,
	"voice_profile_id" uuid,
	"speaker_label" text,
	"terms_version" text NOT NULL,
	"ai_notice_version" text NOT NULL,
	"phrase" text,
	"phrase_audio_sha256" text,
	"match_score" real,
	"status" "consent_status" DEFAULT 'active' NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"retain_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "voice_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"style" "style" NOT NULL,
	"script_id" text NOT NULL,
	"script_version" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"status" "clip_status" DEFAULT 'checking' NOT NULL,
	"signal" jsonb,
	"cer" real
);
--> statement-breakpoint
CREATE TABLE "voice_handles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clip_id" uuid NOT NULL,
	"engine_id" text NOT NULL,
	"model_rev" text NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "voice_handles_clip_engine_unique" UNIQUE("clip_id","engine_id","model_rev")
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"active_consent_id" uuid
);
--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_chapters" ADD CONSTRAINT "render_chapters_render_id_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."renders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_clips" ADD CONSTRAINT "voice_clips_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_clips" ADD CONSTRAINT "voice_clips_consent_id_consent_records_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consent_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_handles" ADD CONSTRAINT "voice_handles_clip_id_voice_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."voice_clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_active_consent_id_consent_records_id_fk" FOREIGN KEY ("active_consent_id") REFERENCES "public"."consent_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_codes_email_idx" ON "otp_codes" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "renders_key_unless_failed" ON "renders" USING btree ("render_key") WHERE "renders"."status" <> 'failed';--> statement-breakpoint
CREATE INDEX "renders_user_idx" ON "renders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "voice_clips_profile_idx" ON "voice_clips" USING btree ("voice_profile_id");--> statement-breakpoint
CREATE INDEX "voice_profiles_user_idx" ON "voice_profiles" USING btree ("user_id");