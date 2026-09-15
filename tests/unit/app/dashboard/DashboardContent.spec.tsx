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

const emptyProgress = {
  percent: 0,
  completedModules: 0,
  totalModules: 0,
  completedTasks: 0,
  totalTasks: 0,
  planCount: 0,
};

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
      progress: {
        percent: 0,
        completedModules: 0,
        totalModules: 1,
        completedTasks: 0,
        totalTasks: 1,
        planCount: 1,
      },
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
    expect(
      screen.queryByRole('heading', { name: 'Suggested next steps' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Based on your current plans and available actions.'),
    ).not.toBeInTheDocument();
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
      progress: {
        percent: 0,
        completedModules: 0,
        totalModules: 1,
        completedTasks: 0,
        totalTasks: 1,
        planCount: 1,
      },
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
      progress: emptyProgress,
    });

    render(await DashboardContent());

    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(
      screen.getByRole('heading', { name: 'Start learning' }),
    ).toBeVisible();
    expect(
      screen.getByText('Progress will appear here once you have a plan.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Begin tonight' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Join the community')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Suggested next steps' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('See pricing')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: /Review every route you have started/,
      }),
    ).not.toBeInTheDocument();
  });

  it('shows overall progress from the uncapped aggregate, not the recent-plan window', async () => {
    const { modules: _smallModules, ...smallPlan } = buildPlan({
      generationStatus: 'ready',
      topic: 'Short plan',
      weeklyHours: 1,
    });
    const resume = buildPlanSummary({
      plan: smallPlan,
      modules: buildModuleRows(smallPlan.id, 1),
      completedTasks: 1,
      totalTasks: 1,
      completion: 1,
      completedModules: 1,
    });
    mocks.getDashboardPlanDataMock.mockResolvedValue({
      summaries: [resume],
      resumePlan: resume,
      progress: {
        percent: 10,
        completedModules: 1,
        totalModules: 4,
        completedTasks: 1,
        totalTasks: 10,
        planCount: 2,
      },
    });

    render(await DashboardContent());

    expect(screen.getByText('Across every learning plan.')).toBeVisible();
    expect(screen.getByText('10%')).toBeVisible();
    expect(screen.getByLabelText('Overall task progress')).toHaveAttribute(
      'aria-valuenow',
      '10',
    );
    expect(screen.getByText('1/4')).toBeVisible();
    expect(screen.getByText('1/10')).toBeVisible();
  });
});
