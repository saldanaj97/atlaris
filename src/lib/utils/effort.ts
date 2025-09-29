export const MODULE_MIN_MINUTES = 15;
export const MODULE_MAX_MINUTES = 480;
export const TASK_MIN_MINUTES = 5;
export const TASK_MAX_MINUTES = 120;

export interface NormalizedEffortResult {
  value: number;
  clamped: boolean;
}

export function normalizeEffort(
  minutes: number,
  min: number,
  max: number
): NormalizedEffortResult {
  if (!Number.isFinite(minutes)) {
    throw new Error(`Effort value must be a finite number (received: ${typeof minutes})`);
  }

  const value = Math.min(Math.max(minutes, min), max);
  return {
    value,
    clamped: value !== minutes,
  };
}

export function normalizeModuleMinutes(
  minutes: number
): NormalizedEffortResult {
  return normalizeEffort(minutes, MODULE_MIN_MINUTES, MODULE_MAX_MINUTES);
}

export function normalizeTaskMinutes(minutes: number): NormalizedEffortResult {
  return normalizeEffort(minutes, TASK_MIN_MINUTES, TASK_MAX_MINUTES);
}

export interface EffortNormalizationFlags {
  modulesClamped: boolean;
  tasksClamped: boolean;
}

export function aggregateNormalizationFlags(
  moduleResults: NormalizedEffortResult[],
  taskResults: NormalizedEffortResult[]
): EffortNormalizationFlags {
  return {
    modulesClamped: moduleResults.some((result) => result.clamped),
    tasksClamped: taskResults.some((result) => result.clamped),
  };
}
