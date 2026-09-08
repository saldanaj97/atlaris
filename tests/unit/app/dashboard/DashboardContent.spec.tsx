import {
  DashboardContent,
  DashboardContentSkeleton,
} from '@/app/(app)/dashboard/components/DashboardContent';
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

  it('names the dashboard loading region while data is pending', () => {
    render(<DashboardContentSkeleton />);

    expect(
      screen.getByRole('region', { name: 'Loading dashboard' }),
    ).toHaveAttribute('aria-busy', 'true');
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

    expect(
      screen.getByRole('heading', { level: 1, name: 'Welcome back, Juan.' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Continue learning' }),
    ).toHaveAttribute('href', `/plans/${plan.id}`);
    expect(screen.getByRole('link', { name: 'View module' })).toHaveAttribute(
      'href',
      `/plans/${plan.id}/modules/${summary.modules[0]?.id}`,
    );
    expect(screen.getByText('Progress tracking coming soon')).toBeVisible();
    expect(
      screen.queryByRole('progressbar', { name: 'Weekly learning pace' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Join the community')).not.toBeInTheDocument();
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    expect(screen.queryByText(/hrs learned/i)).not.toBeInTheDocument();
  });

  it('renders a zero-hour weekly target as reported', async () => {
    const { modules: _modules, ...plan } = buildPlan({
      generationStatus: 'ready',
      topic: 'TypeScript',
      weeklyHours: 0,
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

    expect(screen.getByText('0 hrs planned')).toBeVisible();
    expect(screen.queryByText('No pace set yet')).not.toBeInTheDocument();
  });

  it('routes the empty dashboard CTA to pricing after Free lifetime access is used', async () => {
    mocks.requestBoundaryComponentMock.mockImplementation(async (resolver) =>
      resolver({
        actor: {
          id: 'user-dashboard',
          name: 'Juan Saldana',
          subscriptionTier: 'free',
          initialPlanGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
          freeAccessPlanId: 'plan-1',
          freeAccessPlanSelectedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        db: {} as never,
      }),
    );
    mocks.getDashboardPlanDataMock.mockResolvedValue({
      summaries: [],
      resumePlan: undefined,
    });

    render(await DashboardContent());

    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(
      screen.queryByRole('link', { name: 'Begin tonight' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Join the community')).not.toBeInTheDocument();
  });

  it('shows task-weighted overall progress from live summaries', async () => {
    const { modules: _smallModules, ...smallPlan } = buildPlan({
      generationStatus: 'ready',
      topic: 'Short plan',
      weeklyHours: 1,
    });
    const { modules: _largeModules, ...largePlan } = buildPlan({
      generationStatus: 'ready',
      topic: 'Long plan',
      weeklyHours: 4,
    });
    const resume = buildPlanSummary({
      plan: smallPlan,
      modules: buildModuleRows(smallPlan.id, 1),
      completedTasks: 1,
      totalTasks: 1,
      completion: 1,
      completedModules: 1,
    });
    const other = buildPlanSummary({
      plan: largePlan,
      modules: buildModuleRows(largePlan.id, 3),
      completedTasks: 0,
      totalTasks: 9,
      completion: 0,
      completedModules: 0,
    });
    mocks.getDashboardPlanDataMock.mockResolvedValue({
      summaries: [resume, other],
      resumePlan: resume,
    });

    render(await DashboardContent());

    expect(screen.getByText('10%')).toBeVisible();
    expect(screen.getByLabelText('Overall task progress')).toHaveAttribute(
      'aria-valuenow',
      '10',
    );
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });
});
