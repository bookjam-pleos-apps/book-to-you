CREATE TYPE "public"."clip_advice" AS ENUM('not_distinct');--> statement-breakpoint
ALTER TABLE "voice_clips" ADD COLUMN "advice" "clip_advice";