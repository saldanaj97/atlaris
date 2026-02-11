import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

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
    pdfPlansGenerated: integer('pdf_plans_generated').notNull().default(0),
    regenerationsUsed: integer('regenerations_used').notNull().default(0),
    exportsUsed: integer('exports_used').notNull().default(0),
    ...timestampFields,
  },
  (table) => [
    unique('usage_metrics_user_id_month_unique').on(table.userId, table.month),
    index('idx_usage_metrics_user_id').on(table.userId),
    index('idx_usage_metrics_month').on(table.month),
    check('plans_generated_nonneg', sql`${table.plansGenerated} >= 0`),
    check('pdf_plans_generated_nonneg', sql`${table.pdfPlansGenerated} >= 0`),
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
  ]
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
    costCents: integer('cost_cents').notNull().default(0),
    // TODO: [OPENROUTER-MIGRATION] Consider adding these fields for better cost tracking:
    // estimatedCostCents: integer('estimated_cost_cents'), // OpenRouter provides cost data in responses
    // modelPricingSnapshot: jsonb('model_pricing_snapshot'), // Cache pricing at request time for historical accuracy
    // This would help track actual costs vs. estimates and preserve pricing even if model costs change later
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
      table.createdAt
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
  ]
).enableRLS();
