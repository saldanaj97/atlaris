-- Migration: generation_attempts table
-- Adds generation_attempts for AI plan generation attempt telemetry

CREATE TABLE "generation_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "learning_plans"("id") ON DELETE CASCADE,
  "status" text NOT NULL CHECK (status IN ('success','failure')),
  "classification" text,
  "duration_ms" integer NOT NULL CHECK (duration_ms >= 0),
  "modules_count" integer NOT NULL CHECK (modules_count >= 0),
  "tasks_count" integer NOT NULL CHECK (tasks_count >= 0),
  "truncated_topic" boolean NOT NULL DEFAULT false,
  "truncated_notes" boolean NOT NULL DEFAULT false,
  "normalized_effort" boolean NOT NULL DEFAULT false,
  "prompt_hash" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT classification_null_on_success CHECK ((status = 'success' AND classification IS NULL) OR (status = 'failure'))
);

CREATE INDEX "idx_generation_attempts_plan_id" ON "generation_attempts"("plan_id");
CREATE INDEX "idx_generation_attempts_created_at" ON "generation_attempts"("created_at");

-- RLS enable (policies added separately to keep scope minimal; mirror plan ownership)
ALTER TABLE "generation_attempts" ENABLE ROW LEVEL SECURITY;
