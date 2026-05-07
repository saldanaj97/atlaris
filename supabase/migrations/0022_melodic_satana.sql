DELETE FROM "job_queue" WHERE "job_type" = 'plan_generation';--> statement-breakpoint
ALTER TABLE "job_queue" ALTER COLUMN "job_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."job_type";--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('plan_regeneration');--> statement-breakpoint
ALTER TABLE "job_queue" ALTER COLUMN "job_type" SET DATA TYPE "public"."job_type" USING "job_type"::"public"."job_type";