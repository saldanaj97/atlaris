ALTER TABLE "users"
ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint

DROP TABLE IF EXISTS "plan_generations" CASCADE;
