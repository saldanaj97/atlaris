CREATE TYPE "public"."lesson_generation_status" AS ENUM('not_generated', 'generating', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "lesson_generation_status" "lesson_generation_status" DEFAULT 'not_generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "lesson_generation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "lesson_generation_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "lesson_generation_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "lesson_generation_error" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "lesson_generation_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lesson_content" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lesson_content_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "module_lesson_generation_error_length" CHECK (("modules"."lesson_generation_error" IS NULL OR char_length("modules"."lesson_generation_error") <= 4000));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "task_lesson_content_json_length" CHECK (("tasks"."lesson_content" IS NULL OR length("tasks"."lesson_content"::text) <= 262144));