import { generationQualityStage } from '../../enums';
import { MAX_GENERATION_QUALITY_PASS } from '../constants';
import { planOwnedByCurrentUser } from '../policy-helpers';
import { learningPlans } from './plans';
import { modules, tasks } from './tasks';
import { sql } from 'drizzle-orm';
import {
  boolean,
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
 * Quality issues found by generation checks and repair passes. Every row is
 * kept (no retention policy yet). Writes are server-owned (service role).
 */
export const generationQualityIssues = pgTable(
  'generation_quality_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, {
      onDelete: 'cascade',
    }),
    /** The lesson the issue belongs to (lessons are `tasks` rows). */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    stage: generationQualityStage('stage').notNull(),
    /** Location inside the outline or lesson payload, for example a block index. */
    blockRef: text('block_ref'),
    issueCode: text('issue_code').notNull(),
    message: text('message').notNull(),
    pass: smallint('pass').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'generation_quality_issues_pass_range',
      // react-doctor-disable-next-line react-doctor/raw-sql-injection-risk -- static numeric limit from repo constants, not user input.
      sql`${table.pass} >= 0 AND ${table.pass} <= ${sql.raw(String(MAX_GENERATION_QUALITY_PASS))}`,
    ),
    index('idx_generation_quality_issues_plan_created_at').on(
      table.planId,
      table.createdAt,
    ),
    index('idx_generation_quality_issues_module_id').on(table.moduleId),
    index('idx_generation_quality_issues_task_id').on(table.taskId),

    // Users can read quality issues for plans they own
    pgPolicy('generation_quality_issues_select_own_plan', {
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
