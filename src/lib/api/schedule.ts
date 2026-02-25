import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
} from '@/lib/db/queries/schedules';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import { generateSchedule } from '@/lib/scheduling/generate';
import { computeInputsHash } from '@/lib/scheduling/hash';
import type { ScheduleInputs, ScheduleJson } from '@/lib/scheduling/types';
import { format } from 'date-fns';
import { and, asc, eq } from 'drizzle-orm';

interface GetPlanScheduleParams {
  planId: string;
  userId: string;
}

/** Default timezone for schedule generation when no user timezone is available (e.g. not set in profile or preferences). */
export const DEFAULT_SCHEDULE_TIMEZONE = 'UTC';

/**
 * Resolves the IANA timezone used for schedule generation for the given user.
 * Currently returns {@link DEFAULT_SCHEDULE_TIMEZONE} only; when user timezone is added to profile, preferences, or request context, this will resolve from there and fall back to the default when none is set.
 *
 * @param _userId - User id (reserved for future lookup of user profile/preferences).
 * @param _db - Database client (reserved for future user/preferences queries).
 * @returns The timezone string (e.g. 'UTC', 'America/New_York').
 */
export async function resolveScheduleTimezone(
  _userId: string,
  _db: DbClient
): Promise<string> {
  return DEFAULT_SCHEDULE_TIMEZONE;
}

export const SCHEDULE_FETCH_ERROR_CODE = {
  PLAN_NOT_FOUND_OR_ACCESS_DENIED: 'PLAN_NOT_FOUND_OR_ACCESS_DENIED',
  INVALID_WEEKLY_HOURS: 'INVALID_WEEKLY_HOURS',
} as const;

export type ScheduleFetchErrorCode =
  (typeof SCHEDULE_FETCH_ERROR_CODE)[keyof typeof SCHEDULE_FETCH_ERROR_CODE];

export class ScheduleFetchError extends Error {
  readonly code: ScheduleFetchErrorCode;

  constructor(code: ScheduleFetchErrorCode, message: string) {
    super(message);
    this.name = 'ScheduleFetchError';
    this.code = code;
  }
}

/**
 * Produce a plan's schedule, using a write-through cache to reuse a previously computed result when the schedule inputs have not changed.
 *
 * Verifies the plan exists and belongs to the requesting user, loads the plan's modules and tasks to build scheduling inputs, and returns either a cached ScheduleJson (when the inputs hash matches) or a newly generated schedule that is persisted to the cache.
 *
 * @param params - Object with `planId` and `userId` used to select the plan and verify access.
 * @returns The ScheduleJson representing the plan's schedule.
 */
export async function getPlanSchedule(
  params: GetPlanScheduleParams
): Promise<ScheduleJson> {
  const { planId, userId } = params;
  const db = getDb();

  // Load plan with ownership check in WHERE clause (RLS-enforced)
  const [plan] = await db
    .select({
      id: learningPlans.id,
      weeklyHours: learningPlans.weeklyHours,
      startDate: learningPlans.startDate,
      createdAt: learningPlans.createdAt,
      deadlineDate: learningPlans.deadlineDate,
    })
    .from(learningPlans)
    .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)))
    .limit(1);

  if (!plan) {
    throw new ScheduleFetchError(
      SCHEDULE_FETCH_ERROR_CODE.PLAN_NOT_FOUND_OR_ACCESS_DENIED,
      'Plan not found or access denied'
    );
  }

  const timezone = await resolveScheduleTimezone(userId, db);

  // Load modules and tasks in one query to avoid serial module->task round trips.
  const moduleTaskRows = await db
    .select({
      moduleOrder: modules.order,
      moduleTitle: modules.title,
      taskId: tasks.id,
      taskTitle: tasks.title,
      taskEstimatedMinutes: tasks.estimatedMinutes,
      taskOrder: tasks.order,
      taskModuleId: tasks.moduleId,
    })
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order), asc(tasks.order));

  const flatTasks: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    order: number;
    moduleId: string;
    moduleTitle: string;
  }> = moduleTaskRows
    .filter(
      (
        row
      ): row is typeof row & {
        taskId: string;
        taskTitle: string;
        taskEstimatedMinutes: number;
        taskOrder: number;
        taskModuleId: string;
      } =>
        row.taskId !== null &&
        row.taskTitle !== null &&
        row.taskEstimatedMinutes !== null &&
        row.taskOrder !== null &&
        row.taskModuleId !== null
    )
    .map((row) => ({
      id: row.taskId,
      title: row.taskTitle,
      estimatedMinutes: row.taskEstimatedMinutes,
      order: row.taskOrder,
      moduleId: row.taskModuleId,
      moduleTitle: row.moduleTitle,
    }));

  // Build schedule inputs
  if (plan.weeklyHours <= 0) {
    throw new ScheduleFetchError(
      SCHEDULE_FETCH_ERROR_CODE.INVALID_WEEKLY_HOURS,
      'Plan weekly hours must be greater than zero to generate a schedule'
    );
  }
  const inputs: ScheduleInputs = {
    planId: plan.id,
    tasks: flatTasks.map((task, idx) => ({
      id: task.id,
      title: task.title,
      estimatedMinutes: task.estimatedMinutes,
      order: idx + 1,
      moduleId: task.moduleId,
    })),
    startDate: plan.startDate ?? format(plan.createdAt, 'yyyy-MM-dd'),
    deadline: plan.deadlineDate,
    weeklyHours: plan.weeklyHours,
    timezone,
  };

  // Compute hash
  const inputsHash = computeInputsHash(inputs);

  // Check cache
  const cached = await getPlanScheduleCache(planId, userId, db);
  if (cached && cached.inputsHash === inputsHash) {
    return cached.scheduleJson;
  }

  // Generate new schedule
  const schedule = generateSchedule(inputs);

  // Write through cache
  await upsertPlanScheduleCache(
    planId,
    userId,
    {
      scheduleJson: schedule,
      inputsHash,
      timezone: inputs.timezone,
      weeklyHours: inputs.weeklyHours,
      startDate: inputs.startDate,
      deadline: inputs.deadline,
    },
    db
  );

  return schedule;
}
