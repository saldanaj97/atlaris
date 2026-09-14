export type DashboardProgressTotals = {
  percent: number;
  completedModules: number;
  totalModules: number;
  completedTasks: number;
  totalTasks: number;
  planCount: number;
};

export function buildDashboardProgressTotals(
  items: ReadonlyArray<{
    completedModules: number;
    totalModules: number;
    completedTasks: number;
    totalTasks: number;
  }>,
): DashboardProgressTotals {
  let completedModules = 0;
  let totalModules = 0;
  let completedTasks = 0;
  let totalTasks = 0;

  for (const item of items) {
    completedModules += item.completedModules;
    totalModules += item.totalModules;
    completedTasks += item.completedTasks;
    totalTasks += item.totalTasks;
  }

  return {
    percent:
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    completedModules,
    totalModules,
    completedTasks,
    totalTasks,
    planCount: items.length,
  };
}
