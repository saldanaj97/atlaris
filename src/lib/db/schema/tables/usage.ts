import { sql } from 'drizzle-orm';
import {
	bigint,
	check,
	index,
	integer,
	jsonb,
	pgPolicy,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core';

import type { ModelPricingSnapshot } from '@/shared/types/model-pricing-snapshot.types';

import { timestampFields } from '../helpers';
import { recordOwnedByCurrentUser } from '../policy-helpers';
import { users } from './users';

// Usage tracking tables

export const usageMetrics = pgTable(
	'usage_metrics',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		month: text('month').notNull(), // YYYY-MM
		plansGenerated: integer('plans_generated').notNull().default(0),
		regenerationsUsed: integer('regenerations_used').notNull().default(0),
		exportsUsed: integer('exports_used').notNull().default(0),
		...timestampFields,
	},
	(table) => [
		unique('usage_metrics_user_id_month_unique').on(table.userId, table.month),
		index('idx_usage_metrics_user_id').on(table.userId),
		index('idx_usage_metrics_month').on(table.month),
		check('plans_generated_nonneg', sql`${table.plansGenerated} >= 0`),
		check('regenerations_used_nonneg', sql`${table.regenerationsUsed} >= 0`),
		check('exports_used_nonneg', sql`${table.exportsUsed} >= 0`),

		// RLS policies
		pgPolicy('usage_metrics_select_own', {
			for: 'select',
			to: 'authenticated',
			using: recordOwnedByCurrentUser(table.userId),
		}),
		pgPolicy('usage_metrics_insert_own', {
			for: 'insert',
			to: 'authenticated',
			withCheck: recordOwnedByCurrentUser(table.userId),
		}),
		pgPolicy('usage_metrics_update_own', {
			for: 'update',
			to: 'authenticated',
			using: recordOwnedByCurrentUser(table.userId),
			withCheck: recordOwnedByCurrentUser(table.userId),
		}),
		pgPolicy('usage_metrics_delete_own', {
			for: 'delete',
			to: 'authenticated',
			using: recordOwnedByCurrentUser(table.userId),
		}),
	],
).enableRLS();

export const aiUsageEvents = pgTable(
	'ai_usage_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		model: text('model').notNull(),
		inputTokens: integer('input_tokens').notNull().default(0),
		outputTokens: integer('output_tokens').notNull().default(0),
		/** App-estimated cost from the local catalog (`computeCostCents`); not provider invoice. */
		costCents: integer('cost_cents').notNull().default(0),
		/**
		 * OpenRouter-reported request cost in **integer micro-USD** (USD × 1e6). Nullable when
		 * the provider omitted cost or usage was partial.
		 */
		providerCostMicrousd: bigint('provider_cost_microusd', {
			mode: 'bigint',
		}),
		/** Catalog-backed inputs used to compute `cost_cents` at insert time. */
		modelPricingSnapshot: jsonb(
			'model_pricing_snapshot',
		).$type<ModelPricingSnapshot | null>(),
		requestId: text('request_id'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('idx_ai_usage_user_id').on(table.userId),
		index('idx_ai_usage_created_at').on(table.createdAt),
		index('idx_ai_usage_events_user_created_at').on(
			table.userId,
			table.createdAt,
		),
		check(
			'ai_usage_events_input_tokens_nonneg',
			sql`${table.inputTokens} >= 0`,
		),
		check(
			'ai_usage_events_output_tokens_nonneg',
			sql`${table.outputTokens} >= 0`,
		),
		check('ai_usage_events_cost_cents_nonneg', sql`${table.costCents} >= 0`),
		check(
			'ai_usage_events_provider_cost_microusd_nonneg',
			sql`${table.providerCostMicrousd} IS NULL OR ${table.providerCostMicrousd} >= 0`,
		),

		// RLS policies
		pgPolicy('ai_usage_events_select_own', {
			for: 'select',
			to: 'authenticated',
			using: recordOwnedByCurrentUser(table.userId),
		}),
		pgPolicy('ai_usage_events_insert_own', {
			for: 'insert',
			to: 'authenticated',
			withCheck: recordOwnedByCurrentUser(table.userId),
		}),
	],
).enableRLS();
