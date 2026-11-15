CREATE TYPE "public"."clip_failure" AS ENUM('script_mismatch', 'not_distinct');--> statement-breakpoint
ALTER TABLE "voice_clips" ADD COLUMN "prosody" jsonb;--> statement-breakpoint
ALTER TABLE "voice_clips" ADD COLUMN "failure" "clip_failure";