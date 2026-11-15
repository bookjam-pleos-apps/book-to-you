CREATE TYPE "public"."prompt_kind" AS ENUM('belt_unfastened');--> statement-breakpoint
ALTER TYPE "public"."consent_status" ADD VALUE 'checking' BEFORE 'active';--> statement-breakpoint
CREATE TABLE "pending_purges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_prefix" text NOT NULL,
	"engine_keys" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"kind" "prompt_kind" NOT NULL,
	"script_id" text NOT NULL,
	"script_version" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"bytes" integer NOT NULL,
	"signal" jsonb,
	CONSTRAINT "voice_prompts_voice_kind_unique" UNIQUE("voice_profile_id","kind")
);
--> statement-breakpoint
ALTER TABLE "consent_records" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_prompts" ADD CONSTRAINT "voice_prompts_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_prompts" ADD CONSTRAINT "voice_prompts_consent_id_consent_records_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consent_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_one_live_per_voice" ON "consent_records" USING btree ("voice_profile_id") WHERE "consent_records"."kind" = 'speaker_voice' AND "consent_records"."status" <> 'revoked';