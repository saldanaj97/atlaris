import {
  GENERATION_BUDGET_CUT_STEPS,
  MAX_GENERATION_QUALITY_PASS,
} from '../constants';
import { planOwnedByCurrentUser } from '../policy-helpers';
import { learningPlans } from './plans';
import { modules, tasks } from './tasks';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Optional steps a plan's AI spend ceiling skipped (JCS-170): the advisor on
 * a repair, or a repair pass. Every row is kept (no retention policy yet).
 * Writes are server-owned (service role).
 */
export const generationBudgetCuts = pgTable(
  'generation_budget_cuts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, {
      onDelete: 'cascade',
    }),
    /** The lesson the cut step belonged to (lessons are `tasks` rows). */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    step: text('step', { enum: GENERATION_BUDGET_CUT_STEPS }).notNull(),
    /** The repair pass the cut applied to. */
    pass: smallint('pass').notNull(),
    /** Spend counted against the ceiling when the step was cut. */
    spentMicrousd: bigint('spent_microusd', { mode: 'number' }).notNull(),
    ceilingMicrousd: bigint('ceiling_microusd', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'generation_budget_cuts_step_valid',
      // react-doctor-disable-next-line react-doctor/raw-sql-injection-risk -- static list from repo constants, not user input.
      sql`${table.step} IN (${sql.raw(
        GENERATION_BUDGET_CUT_STEPS.map((step) => `'${step}'`).join(', '),
      )})`,
    ),
    check(
      'generation_budget_cuts_pass_range',
      // react-doctor-disable-next-line react-doctor/raw-sql-injection-risk -- static numeric limit from repo constants, not user input.
      sql`${table.pass} >= 1 AND ${table.pass} <= ${sql.raw(String(MAX_GENERATION_QUALITY_PASS))}`,
    ),
    check(
      'generation_budget_cuts_microusd_nonneg',
      sql`${table.spentMicrousd} >= 0 AND ${table.ceilingMicrousd} >= 0`,
    ),
    index('idx_generation_budget_cuts_plan_created_at').on(
      table.planId,
      table.createdAt,
    ),
    index('idx_generation_budget_cuts_module_id').on(table.moduleId),
    index('idx_generation_budget_cuts_task_id').on(table.taskId),

    // Users can read budget cuts for plans they own
    pgPolicy('generation_budget_cuts_select_own_plan', {
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
