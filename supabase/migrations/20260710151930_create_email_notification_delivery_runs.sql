CREATE TYPE "public"."email_notification_delivery_run_kind" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."email_notification_delivery_run_status" AS ENUM('queued', 'running', 'paused', 'completed', 'failed', 'needs_review');--> statement-breakpoint
CREATE TABLE "email_notification_delivery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_kind" "email_notification_delivery_run_kind" NOT NULL,
	"scheduler_date_utc" date NOT NULL,
	"reference_timestamp_utc" timestamp with time zone NOT NULL,
	"status" "email_notification_delivery_run_status" DEFAULT 'queued' NOT NULL,
	"workflow_run_id" text,
	"monitor_check_in_id" text,
	"cursor_user_id" uuid,
	"scan_completed_at" timestamp with time zone,
	"pages_completed" integer DEFAULT 0 NOT NULL,
	"examined" integer DEFAULT 0 NOT NULL,
	"claimed" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"already_terminal" integer DEFAULT 0 NOT NULL,
	"in_flight" integer DEFAULT 0 NOT NULL,
	"manual_review" integer DEFAULT 0 NOT NULL,
	"recipient_errors" integer DEFAULT 0 NOT NULL,
	"last_error_class" text,
	"last_error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_notification_delivery_runs_kind_date_unique" UNIQUE("run_kind", "scheduler_date_utc"),
	CONSTRAINT "email_notification_delivery_runs_non_negative_counts" CHECK (
		"pages_completed" >= 0
		AND "examined" >= 0
		AND "claimed" >= 0
		AND "sent" >= 0
		AND "skipped" >= 0
		AND "failed" >= 0
		AND "already_terminal" >= 0
		AND "in_flight" >= 0
		AND "manual_review" >= 0
		AND "recipient_errors" >= 0
	)
);
--> statement-breakpoint
ALTER TABLE "email_notification_delivery_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "email_notification_delivery_runs_workflow_run_id_unique" ON "email_notification_delivery_runs" USING btree ("workflow_run_id") WHERE "workflow_run_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_email_notification_delivery_runs_status_updated_at" ON "email_notification_delivery_runs" USING btree ("status", "updated_at");--> statement-breakpoint
CREATE POLICY "email_notification_delivery_runs_deny_all" ON "email_notification_delivery_runs" AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE "email_notification_delivery_runs" FROM anon, authenticated;
