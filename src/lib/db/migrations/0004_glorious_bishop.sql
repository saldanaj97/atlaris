-- Create enums if not existing
DO $$ BEGIN
  CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."job_type" AS ENUM('plan_generation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."learning_style" AS ENUM('reading', 'video', 'practice', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."progress_status" AS ENUM('not_started', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."resource_type" AS ENUM('youtube', 'article', 'course', 'doc', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."skill_level" AS ENUM('beginner', 'intermediate', 'advanced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."subscription_status" AS ENUM('active', 'canceled', 'past_due', 'trialing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'starter', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE "usage_metrics" (
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
-- Safely convert users.subscription_tier (text -> enum)
ALTER TABLE "users" ADD COLUMN "subscription_tier_new" "subscription_tier" NOT NULL DEFAULT 'free';--> statement-breakpoint
UPDATE "users"
SET "subscription_tier_new" = CASE
  WHEN "subscription_tier" IN ('free', 'starter', 'pro') THEN "subscription_tier"::"subscription_tier"
  ELSE 'free'::"subscription_tier"
END;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "subscription_tier";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "subscription_tier_new" TO "subscription_tier";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_status" "subscription_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_usage_metrics_user_id" ON "usage_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_usage_metrics_month" ON "usage_metrics" USING btree ("month");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");--> statement-breakpoint
CREATE POLICY "usage_metrics_select_own" ON "usage_metrics" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("usage_metrics"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "usage_metrics_select_service" ON "usage_metrics" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "usage_metrics_insert_own" ON "usage_metrics" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("usage_metrics"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "usage_metrics_insert_service" ON "usage_metrics" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "usage_metrics_update_own" ON "usage_metrics" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("usage_metrics"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      )) WITH CHECK ("usage_metrics"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "usage_metrics_update_service" ON "usage_metrics" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "usage_metrics_delete_own" ON "usage_metrics" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("usage_metrics"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
      ));--> statement-breakpoint
CREATE POLICY "usage_metrics_delete_service" ON "usage_metrics" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);

-- Harden updates on users: restrict columns for authenticated, allow service role, and maintain updated_at
-- Column-level privileges complement existing RLS row policies

-- Ensure the timestamp maintenance trigger function exists
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

-- Recreate trigger to always keep updated_at fresh on UPDATE
DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;--> statement-breakpoint
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

-- Restrict authenticated role to only update profile-safe columns
REVOKE UPDATE ON TABLE public.users FROM authenticated;--> statement-breakpoint
GRANT UPDATE (name) ON public.users TO authenticated;--> statement-breakpoint

-- Service role may update any column (admin/system tasks)
GRANT UPDATE ON TABLE public.users TO service_role;--> statement-breakpoint
