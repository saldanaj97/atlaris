ALTER TABLE "learning_plans" DROP CONSTRAINT "extracted_context_pdf_shape";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP CONSTRAINT "pdf_plans_generated_nonneg";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_learning_plans_user_origin";--> statement-breakpoint
ALTER TABLE "learning_plans" ALTER COLUMN "origin" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "learning_plans" ALTER COLUMN "origin" SET DATA TYPE text USING "origin"::text;--> statement-breakpoint
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "learning_plans" WHERE "origin" = 'pdf';
  RAISE NOTICE 'migration 0027: coercing % pdf-origin plans to manual', n;
END $$;--> statement-breakpoint
-- Legacy PDF provenance is intentionally collapsed into manual for MVP.
-- Coerce any legacy pdf-origin plans to manual before narrowing the enum.
UPDATE "learning_plans" SET "origin" = 'manual' WHERE "origin" = 'pdf';--> statement-breakpoint
DROP TYPE "public"."plan_origin";--> statement-breakpoint
CREATE TYPE "public"."plan_origin" AS ENUM('ai', 'template', 'manual');--> statement-breakpoint
ALTER TABLE "learning_plans" ALTER COLUMN "origin" SET DATA TYPE "public"."plan_origin" USING "origin"::"public"."plan_origin";--> statement-breakpoint
ALTER TABLE "learning_plans" ALTER COLUMN "origin" SET DEFAULT 'ai'::"public"."plan_origin";--> statement-breakpoint
CREATE INDEX "idx_learning_plans_user_origin" ON "learning_plans" USING btree ("user_id","origin");--> statement-breakpoint
ALTER TABLE "learning_plans" DROP COLUMN "extracted_context";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "pdf_plans_generated";
