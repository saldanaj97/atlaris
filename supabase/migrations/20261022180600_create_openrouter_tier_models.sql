CREATE TABLE "openrouter_tier_models" (
	"tier" "subscription_tier" NOT NULL,
	"model_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"description" text NOT NULL,
	"context_length" integer NOT NULL,
	"max_output_tokens" integer,
	"input_cost_per_million" double precision NOT NULL,
	"output_cost_per_million" double precision NOT NULL,
	"supported_parameters" text[] DEFAULT '{}'::text[] NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "openrouter_tier_models_pkey" PRIMARY KEY("tier","model_id"),
	CONSTRAINT "openrouter_tier_models_limits_nonneg" CHECK ("openrouter_tier_models"."context_length" >= 0
        AND ("openrouter_tier_models"."max_output_tokens" IS NULL OR "openrouter_tier_models"."max_output_tokens" >= 0)
        AND "openrouter_tier_models"."input_cost_per_million" >= 0
        AND "openrouter_tier_models"."output_cost_per_million" >= 0)
);
--> statement-breakpoint
ALTER TABLE "openrouter_tier_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "openrouter_tier_models_deny_all" ON "openrouter_tier_models" AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE "openrouter_tier_models" FROM anon, authenticated;
