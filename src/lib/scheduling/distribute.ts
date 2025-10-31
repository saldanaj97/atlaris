import type {
  ScheduleInputs,
  ScheduleJson,
  Week,
  Day,
  SessionAssignment,
} from './types';
import { addDaysToDate, getWeekBoundaries } from './dates';

const DEFAULT_SESSIONS_PER_WEEK = 3;
const SESSION_DAYS_OFFSET = [0, 2, 4]; // Mon, Wed, Fri (0=Mon, 2=Wed, 4=Fri)

/**
 * Distributes tasks across sessions in a week-based structure
 */
export function distributeTasksToSessions(
  inputs: ScheduleInputs
): ScheduleJson {
  // Input validation
  if (inputs.weeklyHours <= 0) {
    throw new Error('weeklyHours must be greater than 0');
  }

  if (!Array.isArray(inputs.tasks)) {
    throw new Error('tasks must be an array');
  }

  // Validate each task
  for (const task of inputs.tasks) {
    if (task.estimatedMinutes < 0) {
      throw new Error(
        `Task "${task.id}" has invalid estimatedMinutes: must be non-negative`
      );
    }
  }

  // Calculate total minutes and required weeks
  const totalMinutes = inputs.tasks.reduce(
    (sum, t) => sum + t.estimatedMinutes,
    0
  );

  // Handle empty tasks case
  if (totalMinutes === 0) {
    return {
      weeks: [],
      totalWeeks: 0,
      totalSessions: 0,
    };
  }

  const minutesPerWeek = inputs.weeklyHours * 60;
  const totalWeeks = Math.ceil(totalMinutes / minutesPerWeek);

  // Sort tasks by order to ensure deterministic distribution
  // Filter out tasks with zero estimatedMinutes as they don't need scheduling
  const sortedTasks = inputs.tasks
    .slice()
    .filter((t) => t.estimatedMinutes > 0)
    .sort((a, b) => a.order - b.order);

  // Distribute tasks across weeks and sessions
  const weeks: Week[] = [];
  let taskIndex = 0;
  let remainingTaskMinutes = sortedTasks[0]?.estimatedMinutes || 0;
  const sessionMinutes = minutesPerWeek / DEFAULT_SESSIONS_PER_WEEK;

  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    const { startDate, endDate } = getWeekBoundaries(inputs.startDate, weekNum);
    const days: Day[] = [];

    // Create 3 session days (Mon, Wed, Fri) per week
    for (
      let sessionIdx = 0;
      sessionIdx < DEFAULT_SESSIONS_PER_WEEK;
      sessionIdx++
    ) {
      const dayOffset = SESSION_DAYS_OFFSET[sessionIdx];
      const date = addDaysToDate(startDate, dayOffset);
      const sessions: SessionAssignment[] = [];
      let allocatedMinutes = 0;

      // Fill session with tasks until capacity is reached
      while (
        allocatedMinutes < sessionMinutes &&
        taskIndex < sortedTasks.length
      ) {
        const currentTask = sortedTasks[taskIndex];
        const remainingSessionCapacity = sessionMinutes - allocatedMinutes;
        const minutesToAllocate = Math.min(
          remainingTaskMinutes,
          remainingSessionCapacity
        );

        if (minutesToAllocate > 0) {
          sessions.push({
            taskId: currentTask.id,
            taskTitle: currentTask.title,
            estimatedMinutes: minutesToAllocate,
            moduleId: currentTask.moduleId,
            moduleName: `Module ${currentTask.moduleId}`, // Will be enriched later
          });

          allocatedMinutes += minutesToAllocate;
          remainingTaskMinutes -= minutesToAllocate;

          // Move to next task if current is exhausted
          if (remainingTaskMinutes === 0) {
            taskIndex++;
            if (taskIndex < sortedTasks.length) {
              remainingTaskMinutes = sortedTasks[taskIndex].estimatedMinutes;
            }
          }
        } else {
          break;
        }
      }

      // Always create day entry, even if no sessions (for consistent structure)
      days.push({
        dayNumber: sessionIdx + 1,
        date,
        sessions,
      });
    }

    weeks.push({
      weekNumber: weekNum,
      startDate,
      endDate,
      days,
    });
  }

  return {
    weeks,
    totalWeeks,
    totalSessions: weeks.reduce((sum, w) => sum + w.days.length, 0),
  };
}
