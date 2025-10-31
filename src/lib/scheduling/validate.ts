import type { ScheduleJson } from './types';

/**
 * Validates a generated schedule for correctness
 */
export function validateSchedule(schedule: ScheduleJson): void {
  if (schedule.weeks.length === 0) {
    throw new Error('Schedule must have at least one week');
  }

  for (const week of schedule.weeks) {
    if (week.days.length === 0) {
      throw new Error(`Week ${week.weekNumber} has no scheduled days`);
    }

    for (const day of week.days) {
      if (day.sessions.length === 0) {
        throw new Error(
          `Week ${week.weekNumber}, Day ${day.dayNumber} has no sessions`
        );
      }

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

interface TaskWithResources {
  id: string;
  title: string;
  resources: Array<{ id: string; url: string }>;
}

interface ValidationResult {
  valid: boolean;
  tasksWithoutResources: string[];
}

/**
 * Validates that all tasks have at least one linked resource
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
