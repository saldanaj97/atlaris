CREATE TABLE "oauth_state_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_token_hash" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"provider" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_state_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "oauth_state_tokens_hash_idx" ON "oauth_state_tokens" USING btree ("state_token_hash");--> statement-breakpoint
CREATE INDEX "oauth_state_tokens_expires_at_idx" ON "oauth_state_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE POLICY "oauth_state_tokens_insert" ON "oauth_state_tokens" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "oauth_state_tokens_select" ON "oauth_state_tokens" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "oauth_state_tokens_delete" ON "oauth_state_tokens" AS PERMISSIVE FOR DELETE TO public USING (true);