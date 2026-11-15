CREATE TABLE "story_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"render_id" uuid,
	"story_id" text NOT NULL,
	"voice_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_reports_once" UNIQUE NULLS NOT DISTINCT("user_id","device_id","render_id","reason")
);
--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_render_id_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."renders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_reports_render_idx" ON "story_reports" USING btree ("render_id");