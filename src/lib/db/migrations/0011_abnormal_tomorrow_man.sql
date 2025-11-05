CREATE TYPE "public"."integration_provider" AS ENUM('notion', 'google_calendar');--> statement-breakpoint
CREATE TABLE "integration_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone,
	"workspace_id" text,
	"workspace_name" text,
	"bot_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_tokens_user_id_idx" ON "integration_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "integration_tokens_provider_idx" ON "integration_tokens" USING btree ("provider");