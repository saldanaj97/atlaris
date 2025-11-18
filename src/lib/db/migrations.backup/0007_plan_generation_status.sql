CREATE TYPE "generation_status" AS ENUM ('generating', 'ready', 'failed');--> statement-breakpoint

ALTER TABLE "learning_plans"
  ADD COLUMN "generation_status" "generation_status" NOT NULL DEFAULT 'ready';--> statement-breakpoint

ALTER TABLE "learning_plans"
  ADD COLUMN "is_quota_eligible" boolean NOT NULL DEFAULT true;--> statement-breakpoint

ALTER TABLE "learning_plans"
  ADD COLUMN "finalized_at" timestamptz;--> statement-breakpoint

UPDATE "learning_plans"
SET "finalized_at" = COALESCE("updated_at", "created_at")
WHERE "generation_status" = 'ready' AND "finalized_at" IS NULL;--> statement-breakpoint

WITH empty_ai_plans AS (
  SELECT lp.id
  FROM "learning_plans" lp
  LEFT JOIN "modules" m ON m.plan_id = lp.id
  WHERE lp.origin = 'ai'
  GROUP BY lp.id
  HAVING count(m.id) = 0
)
UPDATE "learning_plans"
SET
  "generation_status" = 'failed',
  "is_quota_eligible" = false,
  "finalized_at" = NULL
WHERE id IN (SELECT id FROM empty_ai_plans);--> statement-breakpoint

ALTER TABLE "learning_plans"
  ALTER COLUMN "generation_status" SET DEFAULT 'generating';--> statement-breakpoint

ALTER TABLE "learning_plans"
  ALTER COLUMN "is_quota_eligible" SET DEFAULT false;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_learning_plans_user_quota"
  ON "learning_plans" USING btree ("user_id", "is_quota_eligible");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_learning_plans_user_generation_status"
  ON "learning_plans" USING btree ("user_id", "generation_status");
