import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
} from '@/lib/db/queries/schedules';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, tasks, users } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { generateSchedule } from '@/lib/scheduling/generate';
import { computeInputsHash } from '@/lib/scheduling/hash';
import type { ScheduleInputs, ScheduleJson } from '@/lib/scheduling/types';
import { and, asc, eq, inArray } from 'drizzle-orm';

interface GetPlanScheduleParams {
  planId: string;
  userId: string;
}

const DEFAULT_SCHEDULE_TIMEZONE = 'UTC';

const SUPPORTED_TIME_ZONES =
  typeof Intl.supportedValuesOf === 'function'
    ? new Set(Intl.supportedValuesOf('timeZone'))
    : null;

function extractTimezonePreference(userRecord: unknown): string | undefined {
  if (!userRecord || typeof userRecord !== 'object') {
    return undefined;
  }

  const userLike = userRecord as Record<string, unknown>;

  if (typeof userLike.timezone === 'string') {
    return userLike.timezone;
  }

  const prefs = userLike.prefs;
  if (prefs && typeof prefs === 'object') {
    const prefsLike = prefs as Record<string, unknown>;
    if (typeof prefsLike.timezone === 'string') {
      return prefsLike.timezone;
    }
  }

  return undefined;
}

function resolveScheduleTimezone(
  timezonePreference: string | undefined,
  context: { planId: string; userId: string }
): string {
  if (!timezonePreference) {
    logger.debug(
      { ...context, fallbackTimezone: DEFAULT_SCHEDULE_TIMEZONE },
      'No user timezone preference found; using default timezone'
    );
    return DEFAULT_SCHEDULE_TIMEZONE;
  }

  if (SUPPORTED_TIME_ZONES && !SUPPORTED_TIME_ZONES.has(timezonePreference)) {
    logger.debug(
      {
        ...context,
        timezonePreference,
        fallbackTimezone: DEFAULT_SCHEDULE_TIMEZONE,
      },
      'Invalid user timezone preference; using default timezone'
    );
    return DEFAULT_SCHEDULE_TIMEZONE;
  }

  return timezonePreference;
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
    .select()
    .from(learningPlans)
    .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)))
    .limit(1);

  if (!plan) {
    throw new ScheduleFetchError(
      SCHEDULE_FETCH_ERROR_CODE.PLAN_NOT_FOUND_OR_ACCESS_DENIED,
      'Plan not found or access denied'
    );
  }

  const [currentUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const timezonePreference = extractTimezonePreference(currentUser);
  const timezone = resolveScheduleTimezone(timezonePreference, {
    planId,
    userId,
  });

  // Load modules and tasks in a single joined query
  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order));

  let flatTasks: Array<typeof tasks.$inferSelect & { moduleTitle: string }>;
  if (planModules.length > 0) {
    const moduleIds = planModules.map((m) => m.id);
    const taskRows = await db
      .select({
        task: tasks,
        moduleTitle: modules.title,
      })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .where(inArray(modules.id, moduleIds))
      .orderBy(asc(modules.order), asc(tasks.order));
    flatTasks = taskRows.map((row) => ({
      ...row.task,
      moduleTitle: row.moduleTitle,
    }));
  } else {
    flatTasks = [];
  }

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
    startDate: plan.startDate || plan.createdAt.toISOString().split('T')[0],
    deadline: plan.deadlineDate,
    weeklyHours: plan.weeklyHours,
    timezone,
  };

  // Compute hash
  const inputsHash = computeInputsHash(inputs);

  // Check cache
  const cached = await getPlanScheduleCache(planId, userId);
  if (cached && cached.inputsHash === inputsHash) {
    return cached.scheduleJson;
  }

  // Generate new schedule
  const schedule = generateSchedule(inputs);

  // Write through cache
  await upsertPlanScheduleCache(planId, userId, {
    scheduleJson: schedule,
    inputsHash,
    timezone: inputs.timezone,
    weeklyHours: inputs.weeklyHours,
    startDate: inputs.startDate,
    deadline: inputs.deadline,
  });

  return schedule;
}
