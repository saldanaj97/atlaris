/**
 * Pacing module for trimming AI-generated plans to fit user time capacity
 * Preserves module/task order and ensures at least one task per module
 */

import type { ParsedModule, ParsedTask } from '@/lib/ai/parser';
import type { GenerationInput } from '@/lib/ai/types/provider.types';

/**
 * Pacing parameters for capacity calculation
 */
export interface PacingParams {
  weeklyHours: number;
  skillLevel: string;
  startDate?: string | null;
  deadlineDate?: string | null;
}

/**
 * Parse and validate a date string
 */
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) {
    return null;
  }

  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

/**
 * Calculate the number of weeks between two dates
 * Clamps to minimum of 1 week
 */
function calculateWeeks(startDate: Date | null, deadlineDate: Date): number {
  if (!startDate) {
    return 1;
  }

  const msDiff = deadlineDate.getTime() - startDate.getTime();
  const daysDiff = msDiff / (1000 * 60 * 60 * 24);

  if (daysDiff <= 0) {
    return 1;
  }

  const weeks = Math.ceil(daysDiff / 7);
  return Math.max(1, weeks);
}

/**
 * Calculate average task minutes based on skill level
 * Clamps to [20, 90] range
 */
function calculateAvgTaskMinutes(skillLevel: string): number {
  let base = 45;

  const normalized = skillLevel.toLowerCase();

  if (normalized === 'beginner') {
    base += 10;
  } else if (normalized === 'advanced') {
    base -= 10;
  }

  return Math.max(20, Math.min(90, base));
}

/**
 * Compute task capacity based on user's time constraints
 * @param params Pacing parameters
 * @returns Maximum number of tasks that fit in the time budget
 */
export function computeCapacity(params: PacingParams): number {
  const { weeklyHours, skillLevel, startDate, deadlineDate } = params;

  // Parse dates
  const deadline = parseDate(deadlineDate);
  if (!deadline) {
    return 0;
  }

  const parsedStart = parseDate(startDate);
  const start = parsedStart ?? new Date(); // Use today if no startDate
  const weeks = calculateWeeks(start, deadline);

  // Calculate average task duration
  const avgTaskMinutes = calculateAvgTaskMinutes(skillLevel);

  // Compute capacity
  const capacity = Math.floor((weeklyHours * weeks * 60) / avgTaskMinutes);

  // Clamp to non-negative
  return Math.max(0, capacity);
}

/**
 * Trim modules to fit within capacity while preserving order
 * Ensures at least one task per module when tasks exist
 * @param modules Array of modules to trim
 * @param capacity Maximum number of tasks allowed
 * @returns Trimmed modules array, filtered to exclude empty modules
 */
export function trimModulesToCapacity(
  modules: ParsedModule[],
  capacity: number
): ParsedModule[] {
  if (capacity <= 0) {
    return [];
  }

  // Count total tasks
  const totalTasks = modules.reduce((sum, m) => sum + m.tasks.length, 0);

  // If capacity is sufficient, return original filtered for empty modules
  if (capacity >= totalTasks) {
    return modules.filter((m) => m.tasks.length > 0);
  }

  // Preselect first task of each module (ensures ≥1 per module)
  const preselectedTasks: ParsedTask[] = [];
  const preselectedModuleIndices = new Set<number>();

  for (let moduleIdx = 0; moduleIdx < modules.length; moduleIdx++) {
    const currentModule = modules[moduleIdx];
    if (currentModule.tasks.length > 0) {
      preselectedTasks.push(currentModule.tasks[0]);
      preselectedModuleIndices.add(moduleIdx);
    }
  }

  // If we've already hit capacity with preselections, stop here
  if (preselectedTasks.length >= capacity) {
    let remaining = capacity;
    const limited: ParsedModule[] = [];
    for (const m of modules) {
      if (m.tasks.length === 0) continue;
      if (remaining <= 0) break;
      limited.push({ ...m, tasks: m.tasks.slice(0, 1) });
      remaining -= 1;
    }
    return limited;
  }

  // Build ordered queue of remaining tasks
  const remainingTasks: Array<{
    task: ParsedTask;
    moduleIdx: number;
    taskIdx: number;
  }> = [];

  for (let moduleIdx = 0; moduleIdx < modules.length; moduleIdx++) {
    const currentModule = modules[moduleIdx];
    for (let taskIdx = 1; taskIdx < currentModule.tasks.length; taskIdx++) {
      remainingTasks.push({
        task: currentModule.tasks[taskIdx],
        moduleIdx,
        taskIdx,
      });
    }
  }

  // Take remaining slots until capacity is reached
  const additionalNeeded = capacity - preselectedTasks.length;
  const additionalTasks = remainingTasks.slice(0, additionalNeeded);

  // Build result modules
  const resultModules: ParsedModule[] = [];

  for (let moduleIdx = 0; moduleIdx < modules.length; moduleIdx++) {
    const currentModule = modules[moduleIdx];
    const currentModuleTasks: ParsedTask[] = [];

    // Add preselected first task
    if (currentModule.tasks.length > 0) {
      currentModuleTasks.push(currentModule.tasks[0]);
    }

    // Add additional tasks from this module
    for (const addl of additionalTasks) {
      if (addl.moduleIdx === moduleIdx) {
        currentModuleTasks.push(addl.task);
      }
    }

    // Only include modules that have tasks
    if (currentModuleTasks.length > 0) {
      resultModules.push({
        ...currentModule,
        tasks: currentModuleTasks,
      });
    }
  }

  return resultModules;
}

/**
 * Pace a plan by trimming it to fit user's time capacity
 * @param modules Original modules from AI generation
 * @param input Generation input with pacing parameters
 * @returns Trimmed modules array
 */
export function pacePlan(
  modules: ParsedModule[],
  input: GenerationInput
): ParsedModule[] {
  // If no deadline provided, do not trim the plan.
  // Treat as unbounded capacity to preserve original modules (excluding empties).
  const noDeadlineProvided =
    input.deadlineDate == null ||
    (typeof input.deadlineDate === 'string' &&
      input.deadlineDate.trim() === '');
  if (noDeadlineProvided) {
    return trimModulesToCapacity(modules, Number.POSITIVE_INFINITY);
  }

  const params: PacingParams = {
    weeklyHours: input.weeklyHours,
    skillLevel: input.skillLevel,
    startDate: input.startDate,
    deadlineDate: input.deadlineDate,
  };

  const capacity = computeCapacity(params);

  // If no capacity, ensure at least 1 task per module (minimum viable)
  const effectiveCapacity = capacity > 0 ? capacity : modules.length;

  return trimModulesToCapacity(modules, effectiveCapacity);
}
