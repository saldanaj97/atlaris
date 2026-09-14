import { buildDashboardProgressTotals } from '@/features/plans/read-projection/dashboard-progress';
import { describe, expect, it } from 'vitest';

describe('buildDashboardProgressTotals', () => {
  it('returns zeros for an empty collection', () => {
    expect(buildDashboardProgressTotals([])).toEqual({
      percent: 0,
      completedModules: 0,
      totalModules: 0,
      completedTasks: 0,
      totalTasks: 0,
      planCount: 0,
    });
  });

  it('weights percent by tasks across every plan', () => {
    expect(
      buildDashboardProgressTotals([
        {
          completedModules: 1,
          totalModules: 1,
          completedTasks: 1,
          totalTasks: 1,
        },
        {
          completedModules: 0,
          totalModules: 3,
          completedTasks: 0,
          totalTasks: 9,
        },
      ]),
    ).toEqual({
      percent: 10,
      completedModules: 1,
      totalModules: 4,
      completedTasks: 1,
      totalTasks: 10,
      planCount: 2,
    });
  });
});
