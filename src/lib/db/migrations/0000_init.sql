CREATE TABLE "learning_plans" (
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_hours_check" CHECK ("learning_plans"."weekly_hours" >= 0)
);
--> statement-breakpoint
ALTER TABLE "learning_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "modules" (
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
CREATE TABLE "plan_generations" (
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
CREATE TABLE "resources" (
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
CREATE TABLE "task_progress" (
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
CREATE TABLE "task_resources" (
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
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"estimated_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_module_id_order_unique" UNIQUE("module_id","order"),
	CONSTRAINT "order_check" CHECK ("tasks"."order" >= 1),
	CONSTRAINT "estimated_minutes_check" CHECK ("tasks"."estimated_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"subscription_tier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_generations" ADD CONSTRAINT "plan_generations_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_resources" ADD CONSTRAINT "task_resources_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_resources" ADD CONSTRAINT "task_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_learning_plans_user_id" ON "learning_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_modules_plan_id" ON "modules" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_modules_plan_id_order" ON "modules" USING btree ("plan_id","order");--> statement-breakpoint
CREATE INDEX "idx_plan_generations_plan_id" ON "plan_generations" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_resources_type" ON "resources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_task_progress_user_id" ON "task_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_task_progress_task_id" ON "task_progress" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_resources_task_id" ON "task_resources" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_resources_resource_id" ON "task_resources" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_module_id" ON "tasks" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_module_id_order" ON "tasks" USING btree ("module_id","order");--> statement-breakpoint
CREATE POLICY "learning_plans_select_public_anon" ON "learning_plans" AS PERMISSIVE FOR SELECT TO "anon" USING ("learning_plans"."visibility" = 'public');--> statement-breakpoint
CREATE POLICY "learning_plans_select_public_auth" ON "learning_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("learning_plans"."visibility" = 'public');--> statement-breakpoint
CREATE POLICY "learning_plans_select_own" ON "learning_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("learning_plans"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "learning_plans_select_service" ON "learning_plans" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "learning_plans_insert_own" ON "learning_plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("learning_plans"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "learning_plans_insert_service" ON "learning_plans" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "learning_plans_update_own" ON "learning_plans" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("learning_plans"."user_id" = (select auth.uid())) WITH CHECK ("learning_plans"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "learning_plans_update_service" ON "learning_plans" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "learning_plans_delete_own" ON "learning_plans" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("learning_plans"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "learning_plans_delete_service" ON "learning_plans" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "modules_select_public_anon" ON "modules" AS PERMISSIVE FOR SELECT TO "anon" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."visibility" = 'public'
        )
      );--> statement-breakpoint
CREATE POLICY "modules_select_public_auth" ON "modules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."visibility" = 'public'
        )
      );--> statement-breakpoint
CREATE POLICY "modules_select_own_plan" ON "modules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "modules_select_service" ON "modules" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "modules_insert_own_plan" ON "modules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "modules_insert_service" ON "modules" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "modules_update_own_plan" ON "modules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "modules_update_service" ON "modules" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "modules_delete_own_plan" ON "modules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "modules"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "modules_delete_service" ON "modules" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "plan_generations_select_own" ON "plan_generations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "plan_generations_select_service" ON "plan_generations" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "plan_generations_insert_own" ON "plan_generations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "plan_generations_insert_service" ON "plan_generations" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "plan_generations_update_own" ON "plan_generations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "plan_generations_update_service" ON "plan_generations" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "plan_generations_delete_own" ON "plan_generations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "learning_plans"
          WHERE "learning_plans"."id" = "plan_generations"."plan_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "plan_generations_delete_service" ON "plan_generations" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "resources_select_anon" ON "resources" AS PERMISSIVE FOR SELECT TO "anon" USING (true);--> statement-breakpoint
CREATE POLICY "resources_select_auth" ON "resources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "resources_insert_service" ON "resources" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resources_update_service" ON "resources" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "resources_delete_service" ON "resources" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "task_progress_select_own" ON "task_progress" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("task_progress"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "task_progress_select_service" ON "task_progress" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "task_progress_insert_own" ON "task_progress" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        "task_progress"."user_id" = (select auth.uid()) AND
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_progress"."task_id"
          AND (
            "learning_plans"."user_id" = (select auth.uid()) OR
            "learning_plans"."visibility" = 'public'
          )
        )
      );--> statement-breakpoint
CREATE POLICY "task_progress_insert_service" ON "task_progress" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "task_progress_update_own" ON "task_progress" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("task_progress"."user_id" = (select auth.uid())) WITH CHECK ("task_progress"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "task_progress_update_service" ON "task_progress" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "task_progress_delete_own" ON "task_progress" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("task_progress"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "task_progress_delete_service" ON "task_progress" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "task_resources_select_public_anon" ON "task_resources" AS PERMISSIVE FOR SELECT TO "anon" USING (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."visibility" = 'public'
        )
      );--> statement-breakpoint
CREATE POLICY "task_resources_select_public_auth" ON "task_resources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."visibility" = 'public'
        )
      );--> statement-breakpoint
CREATE POLICY "task_resources_select_own_plan" ON "task_resources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "task_resources_select_service" ON "task_resources" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "task_resources_insert_own_plan" ON "task_resources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "task_resources_update_own_plan" ON "task_resources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "task_resources_delete_own_plan" ON "task_resources" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "tasks"
          JOIN "modules" ON "modules"."id" = "tasks"."module_id"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "tasks"."id" = "task_resources"."task_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "task_resources_insert_service" ON "task_resources" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "task_resources_update_service" ON "task_resources" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "task_resources_delete_service" ON "task_resources" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "tasks_select_public_anon" ON "tasks" AS PERMISSIVE FOR SELECT TO "anon" USING (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."visibility" = 'public'
        )
      );--> statement-breakpoint
CREATE POLICY "tasks_select_public_auth" ON "tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."visibility" = 'public'
        )
      );--> statement-breakpoint
CREATE POLICY "tasks_select_own_plan" ON "tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "tasks_select_service" ON "tasks" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "tasks_insert_own_plan" ON "tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "tasks_insert_service" ON "tasks" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tasks_update_own_plan" ON "tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "tasks_update_service" ON "tasks" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tasks_delete_own_plan" ON "tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM "modules"
          JOIN "learning_plans" ON "learning_plans"."id" = "modules"."plan_id"
          WHERE "modules"."id" = "tasks"."module_id"
          AND "learning_plans"."user_id" = (select auth.uid())
        )
      );--> statement-breakpoint
CREATE POLICY "tasks_delete_service" ON "tasks" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "users_select_own" ON "users" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("users"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "users_select_service" ON "users" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "users_insert_own" ON "users" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("users"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "users_insert_service" ON "users" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "users_update_own_profile" ON "users" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("users"."id" = (select auth.uid())) WITH CHECK ("users"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "users_update_service" ON "users" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "users_delete_service" ON "users" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);