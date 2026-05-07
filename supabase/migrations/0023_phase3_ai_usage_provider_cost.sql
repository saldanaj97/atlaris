ALTER TABLE "ai_usage_events" ADD COLUMN "provider_cost_microusd" bigint;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "model_pricing_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_provider_cost_microusd_nonneg" CHECK ("ai_usage_events"."provider_cost_microusd" IS NULL OR "ai_usage_events"."provider_cost_microusd" >= 0);