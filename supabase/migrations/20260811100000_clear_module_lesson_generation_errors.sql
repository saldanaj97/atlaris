UPDATE "modules"
SET "lesson_generation_error" = NULL
WHERE "lesson_generation_error" IS NOT NULL;
