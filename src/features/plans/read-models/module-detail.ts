import type { ModuleDetail } from '@/lib/db/queries/types/modules.types';

export function normalizeModuleDetail(detail: ModuleDetail): ModuleDetail {
  return {
    ...detail,
    allModules: [...detail.allModules].toSorted((a, b) => a.order - b.order),
    module: {
      ...detail.module,
      tasks: (detail.module.tasks ?? [])
        .toSorted((a, b) => a.order - b.order)
        .map((task) => ({
          ...task,
          resources: (task.resources ?? []).toSorted(
            (a, b) => a.order - b.order
          ),
          progress: task.progress ?? null,
        })),
    },
  };
}
