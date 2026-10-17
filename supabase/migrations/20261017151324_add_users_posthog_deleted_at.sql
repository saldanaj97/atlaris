ALTER TABLE "public"."users"
ADD COLUMN "posthog_deleted_at" timestamp with time zone;

COMMENT ON COLUMN "public"."users"."posthog_deleted_at" IS
'When PostHog accepted deletion of this deleted user''s person, events, and recordings. Null on a tombstoned row means the jobs Worker still has to retry it.';
