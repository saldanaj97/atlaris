import type { NormalizedModulesResult } from '@/lib/db/queries/types/attempts.types';
import {
  aggregateNormalizationFlags,
  normalizeModuleMinutes,
  normalizeTaskMinutes,
} from '@/shared/constants/effort';
import type { ParsedModule } from '@/shared/types/ai-parser.types';

export function normalizeParsedModules(
  modulesInput: ParsedModule[]
): NormalizedModulesResult {
  const moduleFlags: Array<ReturnType<typeof normalizeModuleMinutes>> = [];
  const taskFlags: Array<ReturnType<typeof normalizeTaskMinutes>> = [];

  const normalizedModules = modulesInput.map((module) => {
    const normalizedModule = normalizeModuleMinutes(module.estimatedMinutes);
    moduleFlags.push(normalizedModule);

    const normalizedTasks = module.tasks.map((task) => {
      const normalizedTask = normalizeTaskMinutes(task.estimatedMinutes);
      taskFlags.push(normalizedTask);
      return {
        title: task.title,
        description: task.description ?? null,
        estimatedMinutes: normalizedTask.value,
      };
    });

    return {
      title: module.title,
      description: module.description ?? null,
      estimatedMinutes: normalizedModule.value,
      tasks: normalizedTasks,
    };
  });

  const normalizationFlags = aggregateNormalizationFlags(
    moduleFlags,
    taskFlags
  );

  return { normalizedModules, normalizationFlags };
}
