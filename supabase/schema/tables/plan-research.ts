import { researchMode, researchStatus } from '../../enums';
import { planOwnedByCurrentUser, wrapCondition } from '../policy-helpers';
import { learningPlans } from './plans';
import { sql } from 'drizzle-orm';
import {
  bigint,
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

// Grounded-generation research runs and the sources lessons cite.
// Writes are server-owned (service role); owners can read their own rows.

/**
 * One row per research run for a plan. Regeneration appends a row; the most
 * recent row (by `created_at`) is the plan's current research.
 */
export const planResearch = pgTable(
  'plan_research',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    brief: text('brief').notNull(),
    mode: researchMode('mode').notNull(),
    status: researchStatus('status').notNull(),
    searchCount: integer('search_count').notNull().default(0),
    /** OpenRouter-reported research cost in integer micro-USD (USD × 1e6); null when not reported. */
    costMicrousd: bigint('cost_microusd', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('plan_research_search_count_nonneg', sql`${table.searchCount} >= 0`),
    check(
      'plan_research_cost_microusd_nonneg',
      sql`${table.costMicrousd} IS NULL OR ${table.costMicrousd} >= 0`,
    ),
    index('idx_plan_research_plan_created_at').on(
      table.planId,
      table.createdAt.desc(),
    ),

    // Users can read research for plans they own
    pgPolicy('plan_research_select_own_plan', {
      for: 'select',
      to: 'authenticated',
      using: planOwnedByCurrentUser({
        planIdColumn: table.planId,
        planTable: learningPlans,
        planIdReferenceColumn: learningPlans.id,
        planUserIdColumn: learningPlans.userId,
      }),
    }),
  ],
).enableRLS();

/** A source found by one research run, cited in lessons by `citation_key` (`S1`, `S2`, …). */
export const researchSources = pgTable(
  'research_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    researchId: uuid('research_id')
      .notNull()
      .references(() => planResearch.id, { onDelete: 'cascade' }),
    citationKey: text('citation_key').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    publisher: text('publisher'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    const researchOwnPlanAccess = sql`
      EXISTS (
        SELECT 1 FROM ${planResearch}
        WHERE ${planResearch.id} = ${table.researchId}
        AND ${wrapCondition(
          planOwnedByCurrentUser({
            planIdColumn: planResearch.planId,
            planTable: learningPlans,
            planIdReferenceColumn: learningPlans.id,
            planUserIdColumn: learningPlans.userId,
          }),
        )}
      )
    `;

    return [
      check(
        'research_sources_citation_key_format',
        sql`${table.citationKey} ~ '^S[1-9][0-9]*$'`,
      ),
      unique('research_sources_research_id_citation_key_unique').on(
        table.researchId,
        table.citationKey,
      ),

      // Users can read sources of research for plans they own
      pgPolicy('research_sources_select_own_plan', {
        for: 'select',
        to: 'authenticated',
        using: researchOwnPlanAccess,
      }),
    ];
  },
).enableRLS();
