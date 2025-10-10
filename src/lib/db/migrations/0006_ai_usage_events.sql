CREATE TABLE "ai_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "cost_cents" integer NOT NULL DEFAULT 0,
  "request_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "ai_usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "ai_usage_events"
  ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade;--> statement-breakpoint

CREATE INDEX "idx_ai_usage_user_id" ON "ai_usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_created_at" ON "ai_usage_events" USING btree ("created_at");--> statement-breakpoint

CREATE POLICY "ai_usage_events_select_own" ON "ai_usage_events" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ("ai_usage_events"."user_id" IN (
    SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
  ));--> statement-breakpoint

CREATE POLICY "ai_usage_events_select_service" ON "ai_usage_events" AS PERMISSIVE FOR SELECT TO "service_role"
  USING (true);--> statement-breakpoint

CREATE POLICY "ai_usage_events_insert_own" ON "ai_usage_events" AS PERMISSIVE FOR INSERT TO "authenticated"
  WITH CHECK ("ai_usage_events"."user_id" IN (
    SELECT id FROM "users" WHERE "users"."clerk_user_id" = (select auth.jwt()->>'sub')
  ));--> statement-breakpoint

CREATE POLICY "ai_usage_events_insert_service" ON "ai_usage_events" AS PERMISSIVE FOR INSERT TO "service_role"
  WITH CHECK (true);

