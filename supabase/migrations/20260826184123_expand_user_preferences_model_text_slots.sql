-- Expand: store saved model preference as server-validated text and add
-- nullable operation slots. Preserve existing preferred_ai_model values via
-- USING. Keep historical PostgreSQL type preferred_ai_model. No model-id
-- constraints, defaults, backfill copies, or indexes. Old writers remain
-- compatible.

ALTER TABLE "user_preferences" ALTER COLUMN "preferred_ai_model" TYPE text USING "preferred_ai_model"::text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "preferred_regeneration_ai_model" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "preferred_lesson_ai_model" text;--> statement-breakpoint
REVOKE INSERT, UPDATE ON TABLE "user_preferences" FROM authenticated;--> statement-breakpoint
GRANT INSERT (user_id, preferred_ai_model, preferred_regeneration_ai_model, preferred_lesson_ai_model, analytics_timezone, updated_at) ON TABLE "user_preferences" TO authenticated;--> statement-breakpoint
GRANT UPDATE (preferred_ai_model, preferred_regeneration_ai_model, preferred_lesson_ai_model, analytics_timezone, updated_at) ON TABLE "user_preferences" TO authenticated;
