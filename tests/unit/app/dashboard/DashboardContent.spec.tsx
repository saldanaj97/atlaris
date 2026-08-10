import { DashboardContent } from '@/app/(app)/dashboard/components/DashboardContent';
import { render, screen } from '@testing-library/react';
import {
  buildModuleRows,
  buildPlan,
  buildPlanSummary,
} from '@tests/fixtures/plan-detail';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDashboardPlanDataMock: vi.fn(),
  requestBoundaryComponentMock: vi.fn(),
}));

vi.mock('@/features/plans/read-projection/service', () => ({
  getDashboardPlanData: mocks.getDashboardPlanDataMock,
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    component: mocks.requestBoundaryComponentMock,
  },
}));

describe('DashboardContent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requestBoundaryComponentMock.mockImplementation(async (resolver) =>
      resolver({
        actor: { id: 'user-dashboard', name: 'Juan Saldana' },
        db: {} as never,
      }),
    );
  });

  it('does not fabricate progress before weekly activity is available', async () => {
    const { modules: _modules, ...plan } = buildPlan({
      generationStatus: 'ready',
      topic: 'TypeScript',
      weeklyHours: 2,
    });
    const summary = buildPlanSummary({
      plan,
      modules: buildModuleRows(plan.id, 1),
    });
    mocks.getDashboardPlanDataMock.mockResolvedValue({
      summaries: [summary],
      resumePlan: summary,
    });

    render(await DashboardContent());

    expect(screen.getByText('Progress tracking coming soon')).toBeVisible();
    expect(
      screen.queryByRole('progressbar', { name: 'Weekly learning pace' }),
    ).not.toBeInTheDocument();
  });
});
