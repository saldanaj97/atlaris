import type { ScheduleInputs, ScheduleJson } from './types';
import { distributeTasksToSessions } from './distribute';

/**
 * Generates a deterministic schedule from plan inputs.
 * This is the main entry point for schedule computation.
 */
export function generateSchedule(inputs: ScheduleInputs): ScheduleJson {
  // Validate inputs
  if (!inputs.tasks || inputs.tasks.length === 0) {
    return {
      weeks: [],
      totalWeeks: 0,
      totalSessions: 0,
    };
  }

  // Generate schedule using distribution logic
  const schedule = distributeTasksToSessions(inputs);

  return schedule;
}
