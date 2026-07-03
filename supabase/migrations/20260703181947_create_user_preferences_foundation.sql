CREATE TYPE "email_notification_category" AS ENUM ('weekly_summary', 'daily_reminder', 'streak_reminder');--> statement-breakpoint
CREATE TABLE "user_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "preferred_ai_model" "preferred_ai_model",
  "analytics_timezone" text DEFAULT 'UTC' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "user_email_notification_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "unsubscribe_all_optional_emails" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "user_email_notification_preferences" (
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "category" "email_notification_category" NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "unsubscribed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_email_notification_preferences_user_id_category_pk" PRIMARY KEY ("user_id","category")
);--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_email_notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_email_notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_preferences_select_own" ON "user_preferences"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "user_preferences_insert_own" ON "user_preferences"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "user_preferences_update_own" ON "user_preferences"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
  WITH CHECK (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "user_email_notification_settings_select_own" ON "user_email_notification_settings"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "user_email_notification_settings_insert_own" ON "user_email_notification_settings"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "user_email_notification_settings_update_own" ON "user_email_notification_settings"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
  WITH CHECK (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "user_email_notification_preferences_select_own" ON "user_email_notification_preferences"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "user_email_notification_preferences_insert_own" ON "user_email_notification_preferences"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
CREATE POLICY "user_email_notification_preferences_update_own" ON "user_email_notification_preferences"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  )
  WITH CHECK (
    "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
GRANT SELECT ON TABLE "user_preferences" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "user_preferences" FROM authenticated;--> statement-breakpoint
GRANT INSERT (user_id, preferred_ai_model, analytics_timezone, updated_at) ON TABLE "user_preferences" TO authenticated;--> statement-breakpoint
GRANT UPDATE (preferred_ai_model, analytics_timezone, updated_at) ON TABLE "user_preferences" TO authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE "user_email_notification_settings" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "user_email_notification_settings" FROM authenticated;--> statement-breakpoint
GRANT INSERT (user_id, unsubscribe_all_optional_emails, updated_at) ON TABLE "user_email_notification_settings" TO authenticated;--> statement-breakpoint
GRANT UPDATE (unsubscribe_all_optional_emails, updated_at) ON TABLE "user_email_notification_settings" TO authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE "user_email_notification_preferences" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "user_email_notification_preferences" FROM authenticated;--> statement-breakpoint
GRANT INSERT (user_id, category, enabled, unsubscribed_at, updated_at) ON TABLE "user_email_notification_preferences" TO authenticated;--> statement-breakpoint
GRANT UPDATE (enabled, unsubscribed_at, updated_at) ON TABLE "user_email_notification_preferences" TO authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "user_preferences", "user_email_notification_settings", "user_email_notification_preferences" FROM anon;--> statement-breakpoint
INSERT INTO "user_preferences" ("user_id", "preferred_ai_model", "analytics_timezone")
SELECT "id", "preferred_ai_model", "analytics_timezone" FROM "users"
ON CONFLICT ("user_id") DO NOTHING;
