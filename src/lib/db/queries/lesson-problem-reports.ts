import type { DbClient } from '@/lib/db/types';
import type { LESSON_PROBLEM_REASONS } from '@supabase/schema/constants';

import { executeRows } from '@/lib/db/execute-rows';
import {
  learningPlans,
  lessonProblemReports,
  modules,
  tasks,
} from '@supabase/schema';
import { sql } from 'drizzle-orm';

type LessonProblemReason = (typeof LESSON_PROBLEM_REASONS)[number];

export type UpsertLessonProblemReportParams = {
  userId: string;
  planId: string;
  moduleId: string;
  taskId: string;
  reason: LessonProblemReason;
  note: string | null;
  /**
   * The lesson version the learner read: the task's `lesson_content_updated_at`
   * as the client rendered it (ISO string, millisecond precision), or null.
   */
  lessonContentUpdatedAt: string | null;
};

export type UpsertLessonProblemReportResult =
  | { kind: 'saved'; reportId: string }
  | { kind: 'not-found' }
  | { kind: 'content-changed' };

/**
 * Saves the learner's one report for a lesson in a single statement: the
 * insert selects the task only when it sits in this module and plan, the plan
 * belongs to the learner, the lesson has content, and its version matches the
 * one the learner read; a second report replaces the first (ON CONFLICT).
 * The stored version is the task row's own `lesson_content_updated_at`.
 *
 * JS dates carry milliseconds while Postgres stores microseconds, so the
 * version check truncates the stored value to milliseconds.
 *
 * When nothing is written, one read (same RLS client) classifies why. It only
 * picks the error; it never gates the write.
 */
export async function upsertLessonProblemReport(
  params: UpsertLessonProblemReportParams,
  dbClient: DbClient,
): Promise<UpsertLessonProblemReportResult> {
  const {
    userId,
    planId,
    moduleId,
    taskId,
    reason,
    note,
    lessonContentUpdatedAt,
  } = params;

  const [saved] = await executeRows<{ id: string }>(
    dbClient,
    sql`
      INSERT INTO ${lessonProblemReports} (
        "user_id",
        "plan_id",
        "module_id",
        "task_id",
        "reason",
        "note",
        "lesson_content_updated_at"
      )
      SELECT
        ${learningPlans.userId},
        ${learningPlans.id},
        ${modules.id},
        ${tasks.id},
        ${reason}::lesson_problem_reason,
        ${note},
        ${tasks.lessonContentUpdatedAt}
      FROM ${tasks}
      JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
      JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
      WHERE ${tasks.id} = ${taskId}
        AND ${modules.id} = ${moduleId}
        AND ${learningPlans.id} = ${planId}
        AND ${learningPlans.userId} = ${userId}
        AND ${tasks.lessonContent} IS NOT NULL
        AND date_trunc('milliseconds', ${tasks.lessonContentUpdatedAt})
          IS NOT DISTINCT FROM ${lessonContentUpdatedAt}::timestamptz
      ON CONFLICT ("task_id", "user_id") DO UPDATE SET
        "reason" = EXCLUDED."reason",
        "note" = EXCLUDED."note",
        "lesson_content_updated_at" = EXCLUDED."lesson_content_updated_at",
        "updated_at" = now()
      RETURNING "id"
    `,
  );

  if (saved) {
    return { kind: 'saved', reportId: saved.id };
  }

  const [lesson] = await executeRows<{ has_content: boolean }>(
    dbClient,
    sql`
      SELECT ${tasks.lessonContent} IS NOT NULL AS has_content
      FROM ${tasks}
      JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
      JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
      WHERE ${tasks.id} = ${taskId}
        AND ${modules.id} = ${moduleId}
        AND ${learningPlans.id} = ${planId}
        AND ${learningPlans.userId} = ${userId}
    `,
  );

  return lesson?.has_content
    ? { kind: 'content-changed' }
    : { kind: 'not-found' };
}
