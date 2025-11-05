CREATE TABLE "google_calendar_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sync_token" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gcal_sync_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
CREATE TABLE "task_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_event_id" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_calendar_event_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "google_calendar_sync_state" ADD CONSTRAINT "google_calendar_sync_state_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync_state" ADD CONSTRAINT "google_calendar_sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_calendar_events" ADD CONSTRAINT "task_calendar_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_calendar_events" ADD CONSTRAINT "task_calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_calendar_sync_state_plan_id_idx" ON "google_calendar_sync_state" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "google_calendar_sync_state_user_id_idx" ON "google_calendar_sync_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_calendar_events_task_id_idx" ON "task_calendar_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_calendar_events_user_id_idx" ON "task_calendar_events" USING btree ("user_id");