import type { ScheduleJson } from './types';
import type { TaskWithResources } from '@/lib/types/db';

/**
 * Ensures the schedule contains at least one week, each week contains days, each day contains sessions, and each session has a `taskId`, `taskTitle`, and `estimatedMinutes` greater than zero.
 *
 * @param schedule - The schedule object to validate
 * @throws Error - If the schedule has no weeks; if any week has no days; if any day has no sessions; if a session is missing `taskId` or `taskTitle`; or if a session's `estimatedMinutes` is less than or equal to zero. Error messages include week/day/task context.
 */
export function validateSchedule(schedule: ScheduleJson): void {
  // Allow empty schedules (e.g., when there are no tasks)
  if (schedule.weeks.length === 0) {
    return;
  }

  for (const week of schedule.weeks) {
    if (week.days.length === 0) {
      throw new Error(`Week ${week.weekNumber} has no scheduled days`);
    }

    for (const day of week.days) {
      // Days with zero sessions are allowed; UI may display them as empty

      for (const session of day.sessions) {
        if (!session.taskId || !session.taskTitle) {
          throw new Error(
            `Invalid session in Week ${week.weekNumber}, Day ${day.dayNumber}`
          );
        }

        if (session.estimatedMinutes <= 0) {
          throw new Error(
            `Task ${session.taskId} has invalid estimated minutes: ${session.estimatedMinutes}`
          );
        }
      }
    }
  }
}

interface ValidationResult {
  valid: boolean;
  tasksWithoutResources: string[];
}

/**
 * Checks whether every task has at least one linked resource.
 *
 * @returns An object with `valid`: `true` if every task has at least one resource, `false` otherwise; and `tasksWithoutResources`: an array of task IDs that have no resources
 */
export function validateTaskResources(
  tasks: TaskWithResources[]
): ValidationResult {
  const tasksWithoutResources = tasks
    .filter((task) => !task.resources || task.resources.length === 0)
    .map((task) => task.id);

  return {
    valid: tasksWithoutResources.length === 0,
    tasksWithoutResources,
  };
}