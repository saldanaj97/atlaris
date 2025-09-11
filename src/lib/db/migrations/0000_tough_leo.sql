CREATE TYPE "public"."learning_style" AS ENUM('reading', 'video', 'practice', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."progress_status" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('youtube', 'article', 'course', 'doc', 'other');--> statement-breakpoint
CREATE TYPE "public"."skill_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
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
CREATE INDEX "idx_tasks_module_id_order" ON "tasks" USING btree ("module_id","order");