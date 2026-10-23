-- Seeds Starter and Pro with the code-owned model list that predates the
-- guardrail sync (DEV-174), so the jobs Worker, which has no tier keys, never
-- reads an empty catalog before the app's first sync. `synced_at` is the epoch,
-- so the app treats these rows as stale and replaces them on its first read.
-- Rows a sync already wrote are kept.
INSERT INTO "openrouter_tier_models" (
	"tier",
	"model_id",
	"name",
	"provider",
	"description",
	"context_length",
	"max_output_tokens",
	"input_cost_per_million",
	"output_cost_per_million",
	"synced_at"
)
SELECT
	"tiers"."tier"::"subscription_tier",
	"models"."model_id",
	"models"."name",
	"models"."provider",
	"models"."description",
	"models"."context_length",
	"models"."max_output_tokens",
	"models"."input_cost_per_million",
	"models"."output_cost_per_million",
	'epoch'::timestamptz
FROM (
	VALUES
		('openai/gpt-6-luna', 'GPT-6 Luna', 'OpenAI', 'Fast, low-cost OpenAI model for everyday plan generation.', 1050000, 128000, 0.1::double precision, 0.5::double precision, ARRAY['starter', 'pro']),
		('anthropic/claude-haiku-5.5', 'Claude Haiku 5.5', 'Anthropic', 'Fast and efficient model from Anthropic with strong reasoning capabilities.', 1000000, 128000, 0.1, 0.5, ARRAY['starter', 'pro']),
		('deepseek/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 'DeepSeek', 'Low-cost DeepSeek flash model with a very large context.', 1048576, 943718, 0.3, 1.2, ARRAY['starter']),
		('openai/gpt-6.1-sol', 'GPT-6.1 Sol', 'OpenAI', 'Latest frontier OpenAI model for complex, multi-step planning.', 1050000, 128000, 2, 10, ARRAY['starter', 'pro']),
		('openai/gpt-6-sol', 'GPT-6 Sol', 'OpenAI', 'Frontier OpenAI model with strong performance across diverse tasks.', 1050000, 128000, 2, 10, ARRAY['pro']),
		('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic', 'Premium model with exceptional reasoning and nuanced understanding.', 1000000, 128000, 2, 10, ARRAY['pro']),
		('anthropic/claude-opus-5.5', 'Claude Opus 5.5', 'Anthropic', 'Most capable Anthropic model for the hardest reasoning tasks.', 1000000, 128000, 4, 20, ARRAY['pro'])
) AS "models" (
	"model_id",
	"name",
	"provider",
	"description",
	"context_length",
	"max_output_tokens",
	"input_cost_per_million",
	"output_cost_per_million",
	"tiers"
)
CROSS JOIN LATERAL unnest("models"."tiers") AS "tiers" ("tier")
ON CONFLICT ("tier", "model_id") DO NOTHING;
