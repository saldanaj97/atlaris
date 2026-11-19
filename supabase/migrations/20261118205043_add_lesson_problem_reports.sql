CREATE TYPE "public"."lesson_problem_reason" AS ENUM('incorrect', 'unclear', 'broken_source', 'other');--> statement-breakpoint
CREATE TABLE "lesson_problem_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"reason" "lesson_problem_reason" NOT NULL,
	"note" text,
	"lesson_content_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_problem_reports_task_id_user_id_unique" UNIQUE("task_id","user_id"),
	CONSTRAINT "lesson_problem_reports_note_length" CHECK (("lesson_problem_reports"."note" IS NULL OR char_length("lesson_problem_reports"."note") <= 1000))
);
--> statement-breakpoint
ALTER TABLE "lesson_problem_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lesson_problem_reports" ADD CONSTRAINT "lesson_problem_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_problem_reports" ADD CONSTRAINT "lesson_problem_reports_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_problem_reports" ADD CONSTRAINT "lesson_problem_reports_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_problem_reports" ADD CONSTRAINT "lesson_problem_reports_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lesson_problem_reports_user_id" ON "lesson_problem_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_lesson_problem_reports_plan_id" ON "lesson_problem_reports" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_lesson_problem_reports_module_id" ON "lesson_problem_reports" USING btree ("module_id");--> statement-breakpoint
CREATE POLICY "lesson_problem_reports_select_own" ON "lesson_problem_reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
    "lesson_problem_reports"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "lesson_problem_reports_insert_own" ON "lesson_problem_reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
      (
    "lesson_problem_reports"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
      AND (
      EXISTS (
        SELECT 1 FROM "tasks"
        JOIN "modules" ON "modules"."id" = "tasks"."module_id"
        JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
        WHERE "tasks"."id" = "lesson_problem_reports"."task_id"
        AND "modules"."id" = "lesson_problem_reports"."module_id"
        AND "learning_plans"."id" = "lesson_problem_reports"."plan_id"
        AND "learning_plans"."user_id" = "lesson_problem_reports"."user_id"
      )
    )
    );--> statement-breakpoint
CREATE POLICY "lesson_problem_reports_update_own" ON "lesson_problem_reports" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
    "lesson_problem_reports"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  ) WITH CHECK (
      (
    "lesson_problem_reports"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
      AND (
      EXISTS (
        SELECT 1 FROM "tasks"
        JOIN "modules" ON "modules"."id" = "tasks"."module_id"
        JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
        WHERE "tasks"."id" = "lesson_problem_reports"."task_id"
        AND "modules"."id" = "lesson_problem_reports"."module_id"
        AND "learning_plans"."id" = "lesson_problem_reports"."plan_id"
        AND "learning_plans"."user_id" = "lesson_problem_reports"."user_id"
      )
    )
    );--> statement-breakpoint
-- Owner-writable like task_progress: learners insert and replace their own
-- report; only the report fields are updatable; no deletes from clients.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "lesson_problem_reports" FROM anon;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "lesson_problem_reports" TO authenticated;--> statement-breakpoint
REVOKE UPDATE ON TABLE "lesson_problem_reports" FROM authenticated;--> statement-breakpoint
GRANT UPDATE ("reason", "note", "lesson_content_updated_at", "updated_at") ON TABLE "lesson_problem_reports" TO authenticated;--> statement-breakpoint
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "lesson_problem_reports" FROM authenticated;
