ALTER TABLE "users"
ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN "clerk_user_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users"
ADD COLUMN "clerk_deleted_at" timestamp with time zone;
