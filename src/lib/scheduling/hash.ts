import crypto from 'crypto';
import type { ScheduleInputs } from './types';

/**
 * Computes a deterministic hash of schedule inputs for cache validation.
 * Hash changes when any input that affects schedule calculation changes.
 */
export function computeInputsHash(inputs: ScheduleInputs): string {
  // Create canonical representation of inputs
  const canonical = {
    planId: inputs.planId,
    // Include tasks in their provided order (hash is sensitive to array order)
    tasks: inputs.tasks.map((t) => ({
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
