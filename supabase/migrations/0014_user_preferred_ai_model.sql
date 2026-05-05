DO $$ BEGIN
 CREATE TYPE "preferred_ai_model" AS ENUM(
	'google/gemini-2.0-flash-exp:free',
	'openai/gpt-oss-20b:free',
	'alibaba/tongyi-deepresearch-30b-a3b:free',
	'anthropic/claude-haiku-4.5',
	'google/gemini-2.5-flash-lite',
	'google/gemini-3-flash-preview',
	'google/gemini-3-pro-preview',
	'anthropic/claude-sonnet-4.5',
	'openai/gpt-4o-mini-2024-07-18',
	'openai/gpt-4o-mini-search-preview',
	'openai/gpt-4o',
	'openai/gpt-5.1',
	'openai/gpt-5.2'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "preferred_ai_model" "preferred_ai_model";

ALTER TABLE "users"
ALTER COLUMN "preferred_ai_model" TYPE "preferred_ai_model"
USING CASE
	WHEN "preferred_ai_model" IN (
		'google/gemini-2.0-flash-exp:free',
		'openai/gpt-oss-20b:free',
		'alibaba/tongyi-deepresearch-30b-a3b:free',
		'anthropic/claude-haiku-4.5',
		'google/gemini-2.5-flash-lite',
		'google/gemini-3-flash-preview',
		'google/gemini-3-pro-preview',
		'anthropic/claude-sonnet-4.5',
		'openai/gpt-4o-mini-2024-07-18',
		'openai/gpt-4o-mini-search-preview',
		'openai/gpt-4o',
		'openai/gpt-5.1',
		'openai/gpt-5.2'
	)
	THEN "preferred_ai_model"::"preferred_ai_model"
	ELSE NULL
END;
