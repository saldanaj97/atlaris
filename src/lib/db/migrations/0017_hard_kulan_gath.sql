ALTER TABLE "tasks" ADD COLUMN "has_micro_explanation" boolean DEFAULT false NOT NULL;

-- Backfill: Set flag for tasks with legacy HTML comment markers
UPDATE "tasks"
SET "has_micro_explanation" = true
WHERE "description" LIKE '%<!-- micro-explanation-% -->%'
   OR "description" LIKE '%<!-- micro-explanation-%' || E'\n' || '%';

-- Remove HTML comment markers from descriptions (keep the explanation body)
UPDATE "tasks"
SET "description" = regexp_replace(
  "description",
  '<!-- micro-explanation-[^>]+ -->\n?',
  '',
  'g'
)
WHERE "description" LIKE '%<!-- micro-explanation-%';