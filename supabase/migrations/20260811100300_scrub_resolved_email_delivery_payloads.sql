UPDATE "email_notification_deliveries"
SET "provider_request" = NULL
WHERE "status" IN ('sent', 'skipped')
  AND "provider_request" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "email_notification_deliveries"
VALIDATE CONSTRAINT "email_notification_deliveries_resolved_provider_request_null";
