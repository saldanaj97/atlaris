import type {
  ParsedModule,
  ParsedTask,
} from '@/features/ai/types/parser.types';
import type { GenerationInput } from '@/features/ai/types/provider.types';
import type { SkillLevel } from '@/shared/types/db.types';

/**
 * Pacing module for trimming AI-generated plans to fit user time capacity
 * Preserves module/task order and ensures at least one task per module
 */

export type PacingParams = {
  weeklyHours: number;
  skillLevel: SkillLevel;
  startDate?: string | null;
  deadlineDate?: string | null;
};

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

function calculateWeeks(startDate: Date, deadlineDate: Date): number {
  const msDiff = deadlineDate.getTime() - startDate.getTime();
  const daysDiff = msDiff / (1000 * 60 * 60 * 24);

  if (daysDiff <= 0) {
    return 1;
  }

  const weeks = Math.ceil(daysDiff / 7);
  return Math.max(1, weeks);
}

function calculateAvgTaskMinutes(skillLevel: SkillLevel): number {
  switch (skillLevel) {
    case 'beginner':
      return 55;
    case 'advanced':
      return 35;
    case 'intermediate':
      return 45;
  }
}

export function computeCapacity(params: PacingParams): number {
  const { weeklyHours, skillLevel, startDate, deadlineDate } = params;

  const parsedDeadline = parseDate(deadlineDate);
  if (!parsedDeadline) {
    return 0;
  }

  const parsedStart = parseDate(startDate);
  const start = parsedStart ?? new Date();
  const weeks = calculateWeeks(start, parsedDeadline);

  const avgTaskMinutes = calculateAvgTaskMinutes(skillLevel);

  const capacity = Math.floor((weeklyHours * weeks * 60) / avgTaskMinutes);

  return Math.max(0, capacity);
}

export function trimModulesToCapacity(
  modules: ParsedModule[],
  capacity: number,
): ParsedModule[] {
  if (capacity <= 0) {
    return [];
  }

  const totalTasks = modules.reduce((sum, m) => sum + m.tasks.length, 0);

  if (capacity >= totalTasks) {
    return modules.filter((m) => m.tasks.length > 0);
  }

  const nonEmptyCount = modules.filter((m) => m.tasks.length > 0).length;

  if (nonEmptyCount >= capacity) {
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

  const remainingTasks: Array<{ task: ParsedTask; moduleIdx: number }> = [];

  for (let moduleIdx = 0; moduleIdx < modules.length; moduleIdx++) {
    const currentModule = modules[moduleIdx];
    for (let taskIdx = 1; taskIdx < currentModule.tasks.length; taskIdx++) {
      remainingTasks.push({ task: currentModule.tasks[taskIdx], moduleIdx });
    }
  }

  const additionalNeeded = capacity - nonEmptyCount;
  const additionalTasks = remainingTasks.slice(0, additionalNeeded);

  const resultModules: ParsedModule[] = [];

  for (let moduleIdx = 0; moduleIdx < modules.length; moduleIdx++) {
    const currentModule = modules[moduleIdx];
    const currentModuleTasks: ParsedTask[] = [];

    if (currentModule.tasks.length > 0) {
      currentModuleTasks.push(currentModule.tasks[0]);
    }

    for (const addl of additionalTasks) {
      if (addl.moduleIdx === moduleIdx) {
        currentModuleTasks.push(addl.task);
      }
    }

    if (currentModuleTasks.length > 0) {
      resultModules.push({
        ...currentModule,
        tasks: currentModuleTasks,
      });
    }
  }

  return resultModules;
}

export function pacePlan(
  modules: ParsedModule[],
  input: GenerationInput,
): ParsedModule[] {
  // If no deadline provided, do not trim the plan.
  // Treat as unbounded capacity to preserve original modules (excluding empties).
  const noDeadlineProvided =
    input.deadlineDate == null || input.deadlineDate.trim() === '';
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

  const effectiveCapacity = capacity > 0 ? capacity : modules.length;

  return trimModulesToCapacity(modules, effectiveCapacity);
}
