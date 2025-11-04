import crypto from 'crypto';
import type { ScheduleInputs } from './types';

/**
 * Create a deterministic SHA-256 hex digest representing the given schedule inputs for cache validation.
 *
 * The digest reflects the canonicalized inputs: `planId`, `tasks` (each with `id`, `title`, `estimatedMinutes`, `order`, and `moduleId` preserved in their original array order), `startDate`, `deadline`, `weeklyHours`, and `timezone`. The hash changes when any of these included fields change.
 *
 * @param inputs - Schedule inputs to include in the canonical representation used for hashing
 * @returns The SHA-256 hex digest of the canonicalized inputs
 */
export function computeInputsHash(inputs: ScheduleInputs): string {
  // Create canonical representation of inputs
  const canonical = {
    planId: inputs.planId,
    // Sort tasks by declared order (then id) for deterministic hashing
    tasks: inputs.tasks
      .slice()
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        estimatedMinutes: t.estimatedMinutes,
        order: t.order,
        moduleId: t.moduleId,
      })),
    startDate: inputs.startDate,
    deadline: inputs.deadline,
    weeklyHours: inputs.weeklyHours,
    timezone: inputs.timezone,
  };

  // Compute SHA-256 hash of JSON representation
  const jsonString = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}
