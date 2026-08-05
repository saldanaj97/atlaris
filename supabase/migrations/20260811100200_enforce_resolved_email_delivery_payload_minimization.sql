ALTER TABLE "email_notification_deliveries"
ADD CONSTRAINT "email_notification_deliveries_resolved_provider_request_null"
CHECK (
  "status" NOT IN ('sent', 'skipped')
  OR "provider_request" IS NULL
) NOT VALID;
