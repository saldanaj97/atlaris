import { lessonProblemReason } from '../../enums';
import { MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH } from '../constants';
import { recordOwnedByCurrentUser, wrapCondition } from '../policy-helpers';
import { learningPlans } from './plans';
import { modules, tasks } from './tasks';
import { users } from './users';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * A learner's report that a generated lesson is wrong or unhelpful (DEV-231).
 * One row per learner and lesson: a new report replaces the earlier one.
 * Owner-writable like `task_progress`; the request route writes through the
 * RLS client. `lesson_content_updated_at` records which version of the lesson
 * was reported.
 */
export const lessonProblemReports = pgTable(
  'lesson_problem_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    /** The reported lesson (lessons are `tasks` rows). */
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    reason: lessonProblemReason('reason').notNull(),
    note: text('note'),
    /** The task's `lesson_content_updated_at` when the report was written. */
    lessonContentUpdatedAt: timestamp('lesson_content_updated_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    const userOwnsRecord = recordOwnedByCurrentUser(table.userId);
    // The task must sit in this row's module and plan, and the plan must
    // belong to this row's user (no inconsistent plan/module/task triples).
    const reportTargetsOwnLesson = sql`
      EXISTS (
        SELECT 1 FROM ${tasks}
        JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
        JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
        WHERE ${tasks.id} = ${table.taskId}
        AND ${modules.id} = ${table.moduleId}
        AND ${learningPlans.id} = ${table.planId}
        AND ${learningPlans.userId} = ${table.userId}
      )
    `;
    const ownConsistentReport = sql`
      ${wrapCondition(userOwnsRecord)}
      AND ${wrapCondition(reportTargetsOwnLesson)}
    `;

    return [
      check(
        'lesson_problem_reports_note_length',
        // react-doctor-disable-next-line react-doctor/raw-sql-injection-risk -- static numeric limit from repo constants, not user input.
        sql`(${table.note} IS NULL OR char_length(${table.note}) <= ${sql.raw(String(MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH))})`,
      ),
      unique('lesson_problem_reports_task_id_user_id_unique').on(
        table.taskId,
        table.userId,
      ),
      index('idx_lesson_problem_reports_user_id').on(table.userId),
      index('idx_lesson_problem_reports_plan_id').on(table.planId),
      index('idx_lesson_problem_reports_module_id').on(table.moduleId),

      // RLS Policies (no delete policy; DELETE is revoked)

      // Users read only their own reports (also needed for ON CONFLICT DO UPDATE)
      pgPolicy('lesson_problem_reports_select_own', {
        for: 'select',
        to: 'authenticated',
        using: userOwnsRecord,
      }),

      // Users report only lessons in plans they own, with a consistent triple
      pgPolicy('lesson_problem_reports_insert_own', {
        for: 'insert',
        to: 'authenticated',
        withCheck: ownConsistentReport,
      }),

      // Users replace only their own report, keeping it consistent
      pgPolicy('lesson_problem_reports_update_own', {
        for: 'update',
        to: 'authenticated',
        using: userOwnsRecord,
        withCheck: ownConsistentReport,
      }),
    ];
  },
).enableRLS();
