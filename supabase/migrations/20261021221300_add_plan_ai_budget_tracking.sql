ALTER TABLE "ai_usage_events" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_usage_events_plan_created_at" ON "ai_usage_events" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE TABLE "generation_budget_cuts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"module_id" uuid,
	"task_id" uuid,
	"step" text NOT NULL,
	"pass" smallint NOT NULL,
	"spent_microusd" bigint NOT NULL,
	"ceiling_microusd" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_budget_cuts_step_valid" CHECK ("generation_budget_cuts"."step" IN ('advisor', 'repair')),
	CONSTRAINT "generation_budget_cuts_pass_range" CHECK ("generation_budget_cuts"."pass" >= 1 AND "generation_budget_cuts"."pass" <= 2),
	CONSTRAINT "generation_budget_cuts_microusd_nonneg" CHECK ("generation_budget_cuts"."spent_microusd" >= 0 AND "generation_budget_cuts"."ceiling_microusd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "generation_budget_cuts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "generation_budget_cuts" ADD CONSTRAINT "generation_budget_cuts_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_budget_cuts" ADD CONSTRAINT "generation_budget_cuts_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_budget_cuts" ADD CONSTRAINT "generation_budget_cuts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_generation_budget_cuts_plan_created_at" ON "generation_budget_cuts" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_generation_budget_cuts_module_id" ON "generation_budget_cuts" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "idx_generation_budget_cuts_task_id" ON "generation_budget_cuts" USING btree ("task_id");--> statement-breakpoint
CREATE POLICY "generation_budget_cuts_select_own_plan" ON "generation_budget_cuts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "generation_budget_cuts"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
GRANT SELECT ON TABLE "generation_budget_cuts" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "generation_budget_cuts" FROM authenticated;
