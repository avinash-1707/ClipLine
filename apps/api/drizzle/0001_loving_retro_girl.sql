CREATE TYPE "public"."transcribe_job_status" AS ENUM('queued', 'downloading', 'transcribing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "transcribe_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"audio_asset_id" uuid NOT NULL,
	"status" "transcribe_job_status" DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcribe_jobs" ADD CONSTRAINT "transcribe_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcribe_jobs" ADD CONSTRAINT "transcribe_jobs_audio_asset_id_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;