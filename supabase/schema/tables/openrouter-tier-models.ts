import { subscriptionTier } from '../../enums';
import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  integer,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Each tier's selectable models, synced from its OpenRouter guardrail
 * (`GET /models/user` with that tier's key; DEV-174). A sync replaces a tier's
 * rows only after a good fetch. Service-role only: deny-all RLS.
 */
export const openRouterTierModels = pgTable(
  'openrouter_tier_models',
  {
    tier: subscriptionTier('tier').notNull(),
    modelId: text('model_id').notNull(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    description: text('description').notNull(),
    contextLength: integer('context_length').notNull(),
    /** OpenRouter's `top_provider.max_completion_tokens`; null when unpublished. */
    maxOutputTokens: integer('max_output_tokens'),
    /** USD per million prompt tokens (base rate; long-prompt overrides ignored). */
    inputCostPerMillion: doublePrecision('input_cost_per_million').notNull(),
    outputCostPerMillion: doublePrecision('output_cost_per_million').notNull(),
    supportedParameters: text('supported_parameters')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'openrouter_tier_models_pkey',
      columns: [table.tier, table.modelId],
    }),
    check(
      'openrouter_tier_models_limits_nonneg',
      sql`${table.contextLength} >= 0
        AND (${table.maxOutputTokens} IS NULL OR ${table.maxOutputTokens} >= 0)
        AND ${table.inputCostPerMillion} >= 0
        AND ${table.outputCostPerMillion} >= 0`,
    ),
    pgPolicy('openrouter_tier_models_deny_all', {
      as: 'restrictive',
      for: 'all',
      to: 'public',
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
).enableRLS();

export type OpenRouterTierModelRow = typeof openRouterTierModels.$inferSelect;
