CREATE TABLE "deleted_plan_generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_plan_generation_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deleted_plan_generation_attempts" ADD CONSTRAINT "deleted_plan_generation_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deleted_plan_generation_attempts_user_created_at" ON "deleted_plan_generation_attempts" USING btree ("user_id","attempt_created_at");--> statement-breakpoint
CREATE POLICY "deleted_plan_generation_attempts_select_own" ON "deleted_plan_generation_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
    "deleted_plan_generation_attempts"."user_id" IN (
      SELECT id FROM "users" WHERE "users"."auth_user_id" = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );--> statement-breakpoint
GRANT SELECT ON TABLE "deleted_plan_generation_attempts" TO authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "deleted_plan_generation_attempts" FROM authenticated;
