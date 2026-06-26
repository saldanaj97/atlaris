CREATE TABLE "learning_activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"previous_status" "progress_status",
	"status" "progress_status" NOT NULL,
	"task_estimated_minutes" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_activity_events_task_estimated_minutes_nonneg" CHECK ("learning_activity_events"."task_estimated_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "learning_activity_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_learning_activity_events_user_occurred" ON "learning_activity_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_learning_activity_events_user_plan_occurred" ON "learning_activity_events" USING btree ("user_id","plan_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_learning_activity_events_task_occurred" ON "learning_activity_events" USING btree ("task_id","occurred_at");--> statement-breakpoint
CREATE POLICY "learning_activity_events_select_own" ON "learning_activity_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
    "learning_activity_events"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
GRANT SELECT ON TABLE "learning_activity_events" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "learning_activity_events" FROM authenticated;--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "private";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "private"."record_learning_activity_event"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "public", pg_temp
AS $$
DECLARE
  task_context record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT
    "tasks"."module_id" AS "module_id",
    "modules"."plan_id" AS "plan_id",
    "learning_plans"."user_id" AS "owner_user_id",
    "tasks"."estimated_minutes" AS "task_estimated_minutes"
  INTO task_context
  FROM "tasks"
  JOIN "modules" ON "modules"."id" = "tasks"."module_id"
  JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
  WHERE "tasks"."id" = NEW.task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing task context for task_progress row %', NEW.id;
  END IF;

  IF task_context."owner_user_id" IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'task_progress user_id does not own task %', NEW.task_id;
  END IF;

  INSERT INTO "learning_activity_events" (
    "user_id",
    "plan_id",
    "module_id",
    "task_id",
    "previous_status",
    "status",
    "task_estimated_minutes",
    "occurred_at"
  )
  VALUES (
    NEW.user_id,
    task_context."plan_id",
    task_context."module_id",
    NEW.task_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    task_context."task_estimated_minutes",
    NEW.updated_at
  );

  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON SCHEMA "private" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."record_learning_activity_event"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
CREATE TRIGGER "record_learning_activity_event"
AFTER INSERT OR UPDATE OF "status" ON "task_progress"
FOR EACH ROW
EXECUTE FUNCTION "private"."record_learning_activity_event"();
