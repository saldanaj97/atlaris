-- Expand: nullable Pro picks for the grounded pipeline's writer, verifier and
-- advisor roles. Separate from the legacy outline/regeneration/lesson slots so
-- the legacy pipeline is unchanged. Server-validated text, no constraints,
-- defaults or backfill. Old writers remain compatible.

ALTER TABLE "user_preferences" ADD COLUMN "preferred_writer_ai_model" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "preferred_verifier_ai_model" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "preferred_advisor_ai_model" text;--> statement-breakpoint
REVOKE INSERT, UPDATE ON TABLE "user_preferences" FROM authenticated;--> statement-breakpoint
GRANT INSERT (user_id, preferred_ai_model, preferred_regeneration_ai_model, preferred_lesson_ai_model, preferred_writer_ai_model, preferred_verifier_ai_model, preferred_advisor_ai_model, analytics_timezone, updated_at) ON TABLE "user_preferences" TO authenticated;--> statement-breakpoint
GRANT UPDATE (preferred_ai_model, preferred_regeneration_ai_model, preferred_lesson_ai_model, preferred_writer_ai_model, preferred_verifier_ai_model, preferred_advisor_ai_model, analytics_timezone, updated_at) ON TABLE "user_preferences" TO authenticated;
