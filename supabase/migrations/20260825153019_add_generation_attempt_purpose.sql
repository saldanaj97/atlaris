-- Expand: persist explicit generation purpose on generation_attempts.
-- Existing rows cannot be classified from usageKind, route, or mutable metadata.
-- Conservative backfill uses DEFAULT 'initial' at ADD COLUMN time. New writers
-- must supply the purpose explicitly. Keep the default during the expand window
-- so old insert paths remain compatible; do not infer purpose at runtime after
-- rollout. No contract drop of the default in this migration.

CREATE TYPE "public"."generation_purpose" AS ENUM('initial', 'regeneration');--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "generation_purpose" "generation_purpose" DEFAULT 'initial' NOT NULL;
