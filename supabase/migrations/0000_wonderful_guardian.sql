DO $$ BEGIN
  CREATE TYPE "public"."generation_status" AS ENUM('generating', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."integration_provider" AS ENUM('notion', 'google_calendar');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."job_type" AS ENUM('plan_generation', 'plan_regeneration');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."learning_style" AS ENUM('reading', 'video', 'practice', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."progress_status" AS ENUM('not_started', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."resource_type" AS ENUM('youtube', 'article', 'course', 'doc', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."skill_level" AS ENUM('beginner', 'intermediate', 'advanced');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."subscription_status" AS ENUM('active', 'canceled', 'past_due', 'trialing');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'starter', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"subscription_tier" "subscription_tier" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" "subscription_status",
	"subscription_period_end" timestamp with time zone,
	"monthly_export_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "users_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_calendar_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sync_token" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gcal_sync_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
ALTER TABLE "google_calendar_sync_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone,
	"workspace_id" text,
	"workspace_name" text,
	"bot_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "integration_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notion_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"notion_page_id" text NOT NULL,
	"notion_database_id" text,
	"sync_hash" text NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_sync_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
ALTER TABLE "notion_sync_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_event_id" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_calendar_event_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text NOT NULL,
	"classification" text,
	"duration_ms" integer NOT NULL,
	"modules_count" integer NOT NULL,
	"tasks_count" integer NOT NULL,
	"truncated_topic" boolean DEFAULT false NOT NULL,
	"truncated_notes" boolean DEFAULT false NOT NULL,
	"normalized_effort" boolean DEFAULT false NOT NULL,
	"prompt_hash" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"skill_level" "skill_level" NOT NULL,
	"weekly_hours" integer NOT NULL,
	"learning_style" "learning_style" NOT NULL,
	"start_date" date,
	"deadline_date" date,
	"visibility" text DEFAULT 'private' NOT NULL,
	"origin" text DEFAULT 'ai' NOT NULL,
	"generation_status" "generation_status" DEFAULT 'generating' NOT NULL,
	"is_quota_eligible" boolean DEFAULT false NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_hours_check" CHECK ("learning_plans"."weekly_hours" >= 0)
);
--> statement-breakpoint
ALTER TABLE "learning_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"model" text NOT NULL,
	"prompt" jsonb NOT NULL,
	"parameters" jsonb,
	"output_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_generations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_schedules" (
	"plan_id" uuid PRIMARY KEY NOT NULL,
	"schedule_json" jsonb NOT NULL,
	"inputs_hash" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timezone" text NOT NULL,
	"weekly_hours" integer NOT NULL,
	"start_date" date NOT NULL,
	"deadline" date
);
--> statement-breakpoint
ALTER TABLE "plan_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"estimated_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_plan_id_order_unique" UNIQUE("plan_id","order"),
	CONSTRAINT "order_check" CHECK ("modules"."order" >= 1),
	CONSTRAINT "estimated_minutes_check" CHECK ("modules"."estimated_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "resource_type" NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"domain" text,
	"author" text,
	"duration_minutes" integer,
	"cost_cents" integer,
	"currency" text,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_url_unique" UNIQUE("url"),
	CONSTRAINT "duration_minutes_check" CHECK ("resources"."duration_minutes" >= 0),
	CONSTRAINT "cost_cents_check" CHECK ("resources"."cost_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "progress_status" DEFAULT 'not_started' NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_progress_task_id_user_id_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_resources_task_id_resource_id_unique" UNIQUE("task_id","resource_id"),
	CONSTRAINT "order_check" CHECK ("task_resources"."order" >= 1)
);
--> statement-breakpoint
ALTER TABLE "task_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"estimated_minutes" integer NOT NULL,
	"has_micro_explanation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_module_id_order_unique" UNIQUE("module_id","order"),
	CONSTRAINT "order_check" CHECK ("tasks"."order" >= 1),
	CONSTRAINT "estimated_minutes_check" CHECK ("tasks"."estimated_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"plans_generated" integer DEFAULT 0 NOT NULL,
	"regenerations_used" integer DEFAULT 0 NOT NULL,
	"exports_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_metrics_user_id_month_unique" UNIQUE("user_id","month"),
	CONSTRAINT "plans_generated_nonneg" CHECK ("usage_metrics"."plans_generated" >= 0),
	CONSTRAINT "regenerations_used_nonneg" CHECK ("usage_metrics"."regenerations_used" >= 0),
	CONSTRAINT "exports_used_nonneg" CHECK ("usage_metrics"."exports_used" >= 0)
);
--> statement-breakpoint
ALTER TABLE "usage_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"user_id" uuid NOT NULL,
	"job_type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_check" CHECK ("job_queue"."attempts" >= 0),
	CONSTRAINT "max_attempts_check" CHECK ("job_queue"."max_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "job_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "google_calendar_sync_state" ADD CONSTRAINT "google_calendar_sync_state_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "google_calendar_sync_state" ADD CONSTRAINT "google_calendar_sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notion_sync_state" ADD CONSTRAINT "notion_sync_state_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notion_sync_state" ADD CONSTRAINT "notion_sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "task_calendar_events" ADD CONSTRAINT "task_calendar_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "task_calendar_events" ADD CONSTRAINT "task_calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_generations" ADD CONSTRAINT "plan_generations_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_schedules" ADD CONSTRAINT "plan_schedules_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "modules" ADD CONSTRAINT "modules_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "task_resources" ADD CONSTRAINT "task_resources_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "task_resources" ADD CONSTRAINT "task_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_sync_state_plan_id_idx" ON "google_calendar_sync_state" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_sync_state_user_id_idx" ON "google_calendar_sync_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_tokens_user_id_idx" ON "integration_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_tokens_provider_idx" ON "integration_tokens" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notion_sync_state_plan_id_idx" ON "notion_sync_state" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notion_sync_state_user_id_idx" ON "notion_sync_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_calendar_events_task_id_idx" ON "task_calendar_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_calendar_events_user_id_idx" ON "task_calendar_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_generation_attempts_plan_id" ON "generation_attempts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_generation_attempts_created_at" ON "generation_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_learning_plans_user_id" ON "learning_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_learning_plans_user_quota" ON "learning_plans" USING btree ("user_id","is_quota_eligible");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_learning_plans_user_generation_status" ON "learning_plans" USING btree ("user_id","generation_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_plan_generations_plan_id" ON "plan_generations" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_plan_schedules_inputs_hash" ON "plan_schedules" USING btree ("inputs_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modules_plan_id" ON "modules" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modules_plan_id_order" ON "modules" USING btree ("plan_id","order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_resources_type" ON "resources" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_progress_user_id" ON "task_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_progress_task_id" ON "task_progress" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_resources_task_id" ON "task_resources" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_resources_resource_id" ON "task_resources" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_module_id" ON "tasks" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_module_id_order" ON "tasks" USING btree ("module_id","order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_user_id" ON "ai_usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_created_at" ON "ai_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_metrics_user_id" ON "usage_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_metrics_month" ON "usage_metrics" USING btree ("month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_created_at" ON "stripe_webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_queue_status_scheduled_priority" ON "job_queue" USING btree ("status","scheduled_for","priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_queue_user_id" ON "job_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_queue_plan_id" ON "job_queue" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_queue_created_at" ON "job_queue" USING btree ("created_at");--> statement-breakpoint
DROP POLICY IF EXISTS "users_select_own" ON "users";
CREATE POLICY "users_select_own" ON "users" AS PERMISSIVE FOR SELECT TO public USING ("users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub');--> statement-breakpoint
DROP POLICY IF EXISTS "users_insert_own" ON "users";
CREATE POLICY "users_insert_own" ON "users" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub');--> statement-breakpoint
DROP POLICY IF EXISTS "users_update_own" ON "users";
CREATE POLICY "users_update_own" ON "users" AS PERMISSIVE FOR UPDATE TO public USING ("users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub') WITH CHECK ("users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub');--> statement-breakpoint
DROP POLICY IF EXISTS "google_calendar_sync_state_select_own" ON "google_calendar_sync_state";
CREATE POLICY "google_calendar_sync_state_select_own" ON "google_calendar_sync_state" AS PERMISSIVE FOR SELECT TO public USING (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "google_calendar_sync_state_insert_own" ON "google_calendar_sync_state";
CREATE POLICY "google_calendar_sync_state_insert_own" ON "google_calendar_sync_state" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "google_calendar_sync_state_update_own" ON "google_calendar_sync_state";
CREATE POLICY "google_calendar_sync_state_update_own" ON "google_calendar_sync_state" AS PERMISSIVE FOR UPDATE TO public USING (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "google_calendar_sync_state_delete_own" ON "google_calendar_sync_state";
CREATE POLICY "google_calendar_sync_state_delete_own" ON "google_calendar_sync_state" AS PERMISSIVE FOR DELETE TO public USING (
    "google_calendar_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "google_calendar_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "integration_tokens_select_own" ON "integration_tokens";
CREATE POLICY "integration_tokens_select_own" ON "integration_tokens" AS PERMISSIVE FOR SELECT TO public USING (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "integration_tokens_insert_own" ON "integration_tokens";
CREATE POLICY "integration_tokens_insert_own" ON "integration_tokens" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "integration_tokens_update_own" ON "integration_tokens";
CREATE POLICY "integration_tokens_update_own" ON "integration_tokens" AS PERMISSIVE FOR UPDATE TO public USING (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "integration_tokens_delete_own" ON "integration_tokens";
CREATE POLICY "integration_tokens_delete_own" ON "integration_tokens" AS PERMISSIVE FOR DELETE TO public USING (
    "integration_tokens"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "notion_sync_state_select_own" ON "notion_sync_state";
CREATE POLICY "notion_sync_state_select_own" ON "notion_sync_state" AS PERMISSIVE FOR SELECT TO public USING (
    "notion_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "notion_sync_state_insert_own" ON "notion_sync_state";
CREATE POLICY "notion_sync_state_insert_own" ON "notion_sync_state" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    "notion_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "notion_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "notion_sync_state_update_own" ON "notion_sync_state";
CREATE POLICY "notion_sync_state_update_own" ON "notion_sync_state" AS PERMISSIVE FOR UPDATE TO public USING (
    "notion_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "notion_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    "notion_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "notion_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "notion_sync_state_delete_own" ON "notion_sync_state";
CREATE POLICY "notion_sync_state_delete_own" ON "notion_sync_state" AS PERMISSIVE FOR DELETE TO public USING (
    "notion_sync_state"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
   AND
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "notion_sync_state"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_calendar_events_select_own" ON "task_calendar_events";
CREATE POLICY "task_calendar_events_select_own" ON "task_calendar_events" AS PERMISSIVE FOR SELECT TO public USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_calendar_events_insert_own" ON "task_calendar_events";
CREATE POLICY "task_calendar_events_insert_own" ON "task_calendar_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_calendar_events_update_own" ON "task_calendar_events";
CREATE POLICY "task_calendar_events_update_own" ON "task_calendar_events" AS PERMISSIVE FOR UPDATE TO public USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_calendar_events_delete_own" ON "task_calendar_events";
CREATE POLICY "task_calendar_events_delete_own" ON "task_calendar_events" AS PERMISSIVE FOR DELETE TO public USING (
    "task_calendar_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "generation_attempts_select" ON "generation_attempts";
CREATE POLICY "generation_attempts_select" ON "generation_attempts" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "generation_attempts"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "generation_attempts_insert" ON "generation_attempts";
CREATE POLICY "generation_attempts_insert" ON "generation_attempts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "generation_attempts"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "learning_plans_select" ON "learning_plans";
CREATE POLICY "learning_plans_select" ON "learning_plans" AS PERMISSIVE FOR SELECT TO public USING ("learning_plans"."visibility" = 'public' OR
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "learning_plans_insert" ON "learning_plans";
CREATE POLICY "learning_plans_insert" ON "learning_plans" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "learning_plans_update" ON "learning_plans";
CREATE POLICY "learning_plans_update" ON "learning_plans" AS PERMISSIVE FOR UPDATE TO public USING (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "learning_plans_delete" ON "learning_plans";
CREATE POLICY "learning_plans_delete" ON "learning_plans" AS PERMISSIVE FOR DELETE TO public USING (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "plan_generations_select" ON "plan_generations";
CREATE POLICY "plan_generations_select" ON "plan_generations" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "plan_generations_insert" ON "plan_generations";
CREATE POLICY "plan_generations_insert" ON "plan_generations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "plan_generations_update" ON "plan_generations";
CREATE POLICY "plan_generations_update" ON "plan_generations" AS PERMISSIVE FOR UPDATE TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "plan_generations_delete" ON "plan_generations";
CREATE POLICY "plan_generations_delete" ON "plan_generations" AS PERMISSIVE FOR DELETE TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_generations"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "plan_schedules_select" ON "plan_schedules";
CREATE POLICY "plan_schedules_select" ON "plan_schedules" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "plan_schedules_insert" ON "plan_schedules";
CREATE POLICY "plan_schedules_insert" ON "plan_schedules" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "plan_schedules_update" ON "plan_schedules";
CREATE POLICY "plan_schedules_update" ON "plan_schedules" AS PERMISSIVE FOR UPDATE TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "plan_schedules_delete" ON "plan_schedules";
CREATE POLICY "plan_schedules_delete" ON "plan_schedules" AS PERMISSIVE FOR DELETE TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_schedules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "modules_select_public_anon" ON "modules";
CREATE POLICY "modules_select_public_anon" ON "modules" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."visibility" = 'public'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "modules_select_public_auth" ON "modules";
CREATE POLICY "modules_select_public_auth" ON "modules" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."visibility" = 'public'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "modules_select_own_plan" ON "modules";
CREATE POLICY "modules_select_own_plan" ON "modules" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "modules_insert_own_plan" ON "modules";
CREATE POLICY "modules_insert_own_plan" ON "modules" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "modules_update_own_plan" ON "modules";
CREATE POLICY "modules_update_own_plan" ON "modules" AS PERMISSIVE FOR UPDATE TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "modules_delete_own_plan" ON "modules";
CREATE POLICY "modules_delete_own_plan" ON "modules" AS PERMISSIVE FOR DELETE TO public USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "resources_select_anon" ON "resources";
CREATE POLICY "resources_select_anon" ON "resources" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "resources_select_auth" ON "resources";
CREATE POLICY "resources_select_auth" ON "resources" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "task_progress_select_own" ON "task_progress";
CREATE POLICY "task_progress_select_own" ON "task_progress" AS PERMISSIVE FOR SELECT TO public USING (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_progress_insert_own" ON "task_progress";
CREATE POLICY "task_progress_insert_own" ON "task_progress" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
          (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
          AND (
      (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_progress"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  )
      OR (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_progress"."task_id"
      AND "learning_plans"."visibility" = 'public'
    )
  )
    )
        );--> statement-breakpoint
DROP POLICY IF EXISTS "task_progress_update_own" ON "task_progress";
CREATE POLICY "task_progress_update_own" ON "task_progress" AS PERMISSIVE FOR UPDATE TO public USING (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
        (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
        AND (
      (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_progress"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  )
      OR (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_progress"."task_id"
      AND "learning_plans"."visibility" = 'public'
    )
  )
    )
      );--> statement-breakpoint
DROP POLICY IF EXISTS "task_progress_delete_own" ON "task_progress";
CREATE POLICY "task_progress_delete_own" ON "task_progress" AS PERMISSIVE FOR DELETE TO public USING (
    "task_progress"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_resources_select_public_anon" ON "task_resources";
CREATE POLICY "task_resources_select_public_anon" ON "task_resources" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND "learning_plans"."visibility" = 'public'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_resources_select_public_auth" ON "task_resources";
CREATE POLICY "task_resources_select_public_auth" ON "task_resources" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND "learning_plans"."visibility" = 'public'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_resources_select_own_plan" ON "task_resources";
CREATE POLICY "task_resources_select_own_plan" ON "task_resources" AS PERMISSIVE FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_resources_insert_own_plan" ON "task_resources";
CREATE POLICY "task_resources_insert_own_plan" ON "task_resources" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_resources_update_own_plan" ON "task_resources";
CREATE POLICY "task_resources_update_own_plan" ON "task_resources" AS PERMISSIVE FOR UPDATE TO public USING (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "task_resources_delete_own_plan" ON "task_resources";
CREATE POLICY "task_resources_delete_own_plan" ON "task_resources" AS PERMISSIVE FOR DELETE TO public USING (
    EXISTS (
      SELECT 1 FROM "tasks"
      JOIN "modules" ON "modules"."id" = "tasks"."module_id"
      JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
      WHERE "tasks"."id" = "task_resources"."task_id"
      AND (
    "learning_plans"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "tasks_select_public_anon" ON "tasks";
CREATE POLICY "tasks_select_public_anon" ON "tasks" AS PERMISSIVE FOR SELECT TO public USING (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."visibility" = 'public'
    )
  )
      )
    );--> statement-breakpoint
DROP POLICY IF EXISTS "tasks_select_public_auth" ON "tasks";
CREATE POLICY "tasks_select_public_auth" ON "tasks" AS PERMISSIVE FOR SELECT TO public USING (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."visibility" = 'public'
    )
  )
      )
    );--> statement-breakpoint
DROP POLICY IF EXISTS "tasks_select_own_plan" ON "tasks";
CREATE POLICY "tasks_select_own_plan" ON "tasks" AS PERMISSIVE FOR SELECT TO public USING (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
DROP POLICY IF EXISTS "tasks_insert_own_plan" ON "tasks";
CREATE POLICY "tasks_insert_own_plan" ON "tasks" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
DROP POLICY IF EXISTS "tasks_update_own_plan" ON "tasks";
CREATE POLICY "tasks_update_own_plan" ON "tasks" AS PERMISSIVE FOR UPDATE TO public USING (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
DROP POLICY IF EXISTS "tasks_delete_own_plan" ON "tasks";
CREATE POLICY "tasks_delete_own_plan" ON "tasks" AS PERMISSIVE FOR DELETE TO public USING (
      EXISTS (
        SELECT 1 FROM "modules"
        WHERE "modules"."id" = "tasks"."module_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "modules"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
DROP POLICY IF EXISTS "ai_usage_events_select_own" ON "ai_usage_events";
CREATE POLICY "ai_usage_events_select_own" ON "ai_usage_events" AS PERMISSIVE FOR SELECT TO public USING (
    "ai_usage_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "ai_usage_events_insert_own" ON "ai_usage_events";
CREATE POLICY "ai_usage_events_insert_own" ON "ai_usage_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    "ai_usage_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "usage_metrics_select_own" ON "usage_metrics";
CREATE POLICY "usage_metrics_select_own" ON "usage_metrics" AS PERMISSIVE FOR SELECT TO public USING (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "usage_metrics_insert_own" ON "usage_metrics";
CREATE POLICY "usage_metrics_insert_own" ON "usage_metrics" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "usage_metrics_update_own" ON "usage_metrics";
CREATE POLICY "usage_metrics_update_own" ON "usage_metrics" AS PERMISSIVE FOR UPDATE TO public USING (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "usage_metrics_delete_own" ON "usage_metrics";
CREATE POLICY "usage_metrics_delete_own" ON "usage_metrics" AS PERMISSIVE FOR DELETE TO public USING (
    "usage_metrics"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "job_queue_select_own" ON "job_queue";
CREATE POLICY "job_queue_select_own" ON "job_queue" AS PERMISSIVE FOR SELECT TO public USING ("job_queue"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      ));--> statement-breakpoint
DROP POLICY IF EXISTS "job_queue_insert_own" ON "job_queue";
CREATE POLICY "job_queue_insert_own" ON "job_queue" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("job_queue"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      ));