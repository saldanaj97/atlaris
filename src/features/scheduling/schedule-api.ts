import { format } from 'date-fns';
import { and, asc, eq } from 'drizzle-orm';
import { distributeTasksToSessions } from '@/features/scheduling/distribute';
import { computeInputsHash } from '@/features/scheduling/hash';
import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
} from '@/lib/db/queries/schedules';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import type {
  ScheduleInputs,
  ScheduleJson,
} from '@/shared/types/scheduling.types';

interface GetPlanScheduleParams {
  planId: string;
  userId: string;
  dbClient: DbClient;
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
export function resolveScheduleTimezone(
  _userId: string,
  _db: DbClient
): string {
  return DEFAULT_SCHEDULE_TIMEZONE;
}

const SCHEDULE_FETCH_ERROR_CODE = {
  PLAN_NOT_FOUND_OR_ACCESS_DENIED: 'PLAN_NOT_FOUND_OR_ACCESS_DENIED',
  INVALID_WEEKLY_HOURS: 'INVALID_WEEKLY_HOURS',
  SCHEDULE_GENERATION_FAILED: 'SCHEDULE_GENERATION_FAILED',
} as const;

type ScheduleFetchErrorCode =
  (typeof SCHEDULE_FETCH_ERROR_CODE)[keyof typeof SCHEDULE_FETCH_ERROR_CODE];

class ScheduleFetchError extends Error {
  readonly code: ScheduleFetchErrorCode;

  constructor(
    code: ScheduleFetchErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
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
  const { planId, userId, dbClient: db } = params;

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

  const timezone = resolveScheduleTimezone(userId, db);

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
      moduleTitle: task.moduleTitle,
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
  let schedule: ScheduleJson;
  try {
    schedule = distributeTasksToSessions(inputs);
  } catch (err) {
    throw new ScheduleFetchError(
      SCHEDULE_FETCH_ERROR_CODE.SCHEDULE_GENERATION_FAILED,
      err instanceof Error ? err.message : 'Failed to generate schedule',
      { cause: err }
    );
  }

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
