CREATE TYPE "public"."research_mode" AS ENUM('fast', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."research_status" AS ENUM('ok', 'failed_skipped');--> statement-breakpoint
CREATE TYPE "public"."generation_quality_stage" AS ENUM('outline', 'lesson');--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "regeneration_reasons" text[];--> statement-breakpoint
ALTER TABLE "learning_plans" ADD COLUMN "regeneration_note" text;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_regeneration_note_length" CHECK (("learning_plans"."regeneration_note" IS NULL OR char_length("learning_plans"."regeneration_note") <= 500));--> statement-breakpoint
CREATE TABLE "plan_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"brief" text NOT NULL,
	"mode" "research_mode" NOT NULL,
	"status" "research_status" NOT NULL,
	"search_count" integer DEFAULT 0 NOT NULL,
	"cost_microusd" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_research_search_count_nonneg" CHECK ("plan_research"."search_count" >= 0),
	CONSTRAINT "plan_research_cost_microusd_nonneg" CHECK ("plan_research"."cost_microusd" IS NULL OR "plan_research"."cost_microusd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plan_research" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_id" uuid NOT NULL,
	"citation_key" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_sources_research_id_citation_key_unique" UNIQUE("research_id","citation_key"),
	CONSTRAINT "research_sources_citation_key_format" CHECK ("research_sources"."citation_key" ~ '^S[1-9][0-9]*$')
);
--> statement-breakpoint
ALTER TABLE "research_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "generation_quality_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"module_id" uuid,
	"task_id" uuid,
	"stage" "generation_quality_stage" NOT NULL,
	"block_ref" text,
	"issue_code" text NOT NULL,
	"message" text NOT NULL,
	"pass" smallint NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_quality_issues_pass_range" CHECK ("generation_quality_issues"."pass" >= 0 AND "generation_quality_issues"."pass" <= 2)
);
--> statement-breakpoint
ALTER TABLE "generation_quality_issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_research" ADD CONSTRAINT "plan_research_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_research_id_plan_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."plan_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_quality_issues" ADD CONSTRAINT "generation_quality_issues_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_quality_issues" ADD CONSTRAINT "generation_quality_issues_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_quality_issues" ADD CONSTRAINT "generation_quality_issues_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_research_plan_created_at" ON "plan_research" USING btree ("plan_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_generation_quality_issues_plan_created_at" ON "generation_quality_issues" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_generation_quality_issues_module_id" ON "generation_quality_issues" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "idx_generation_quality_issues_task_id" ON "generation_quality_issues" USING btree ("task_id");--> statement-breakpoint
CREATE POLICY "plan_research_select_own_plan" ON "plan_research" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_research"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
CREATE POLICY "research_sources_select_own_plan" ON "research_sources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
      EXISTS (
        SELECT 1 FROM "plan_research"
        WHERE "plan_research"."id" = "research_sources"."research_id"
        AND (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "plan_research"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  )
      )
    );--> statement-breakpoint
CREATE POLICY "generation_quality_issues_select_own_plan" ON "generation_quality_issues" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
    EXISTS (
      SELECT 1 FROM "learning_plans"
      WHERE "learning_plans"."id" = "generation_quality_issues"."plan_id"
      AND "learning_plans"."user_id" IN (
        SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );--> statement-breakpoint
GRANT SELECT ON TABLE "plan_research" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "plan_research" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE "research_sources" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "research_sources" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE "generation_quality_issues" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "generation_quality_issues" FROM authenticated;
