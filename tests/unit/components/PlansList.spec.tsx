import type {
  FilterStatus,
  PlanListItem,
  PlanListPage,
  PlanListQuery,
  PlanListStatusCounts,
} from '@/features/plans/read-projection/types';
import type React from 'react';

import { PlansList } from '@/app/(app)/plans/components/PlansList';
import { PLAN_LIST_PAGE_SIZE } from '@/features/plans/read-projection/types';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('PlansList', () => {
  const referenceTimestamp = '2024-06-01T00:00:00.000Z';

  const statusCounts: PlanListStatusCounts = {
    not_started: 0,
    active: 1,
    paused: 0,
    completed: 1,
    generating: 0,
    failed: 0,
  };

  const activePlan: PlanListItem = {
    id: 'plan-1',
    topic: 'Master React Hooks',
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-10T00:00:00.000Z',
    status: 'active',
    completion: 0.4,
    completedTasks: 8,
    totalTasks: 20,
  };

  const completedPlan: PlanListItem = {
    id: 'plan-2',
    topic: 'Learn TypeScript',
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    status: 'completed',
    completion: 1,
    completedTasks: 20,
    totalTasks: 20,
  };

  function buildQuery(overrides: Partial<PlanListQuery> = {}): PlanListQuery {
    return {
      page: 1,
      search: '',
      status: 'all',
      ...overrides,
    };
  }

  function buildPage(overrides: Partial<PlanListPage> = {}): PlanListPage {
    const items = overrides.items ?? [activePlan, completedPlan];

    return {
      items,
      page: 1,
      pageSize: PLAN_LIST_PAGE_SIZE,
      totalItems: items.length,
      totalPages: 1,
      totalSearchResults: items.length,
      statusCounts,
      referenceTimestamp,
      ...overrides,
    };
  }

  function renderPlansList(
    params: {
      page?: Partial<PlanListPage>;
      query?: Partial<PlanListQuery>;
    } = {},
  ) {
    render(
      <PlansList
        page={buildPage(params.page)}
        query={buildQuery(params.query)}
      />,
    );
  }

  it('renders empty state when the current server page has no plans', () => {
    renderPlansList({
      page: {
        items: [],
        totalItems: 0,
        totalPages: 0,
        totalSearchResults: 0,
        statusCounts: {
          not_started: 0,
          active: 0,
          paused: 0,
          completed: 0,
          generating: 0,
          failed: 0,
        },
      },
    });

    expect(screen.getByText('No plans found')).toBeInTheDocument();
    expect(
      screen.getByText(/Create your first plan to get started/i),
    ).toBeInTheDocument();
  });

  it('renders correct link for each plan', () => {
    renderPlansList();

    const planLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/plans/plan-'));
    expect(planLinks).toHaveLength(2);
    expect(planLinks[0]).toHaveAttribute('href', '/plans/plan-1');
    expect(planLinks[1]).toHaveAttribute('href', '/plans/plan-2');
  });

  it('preserves search when building server-side filter links', () => {
    renderPlansList({
      query: { search: 'react hooks' },
    });

    expect(
      within(screen.getByRole('tablist')).getByRole('link', {
        name: /Active/,
      }),
    ).toHaveAttribute(
      'href',
      '/plans?search=react+hooks&status=active',
    );
  });

  it('resets page when submitting search or changing filters', () => {
    renderPlansList({
      page: { page: 2, totalPages: 3 },
      query: { page: 2, search: 'typescript', status: 'completed' },
    });

    expect(screen.getByRole('searchbox')).toHaveValue('typescript');
    expect(screen.getByDisplayValue('completed')).toHaveAttribute(
      'name',
      'status',
    );
    expect(
      screen
        .getAllByRole('link')
        .find(
          (link) => link.getAttribute('href') === '/plans?search=typescript',
        ),
    ).toBeDefined();
  });

  it('renders stable server pagination links', () => {
    renderPlansList({
      page: { page: 2, totalPages: 3, totalItems: 45 },
      query: { page: 2, search: 'react', status: 'active' },
    });

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute(
      'href',
      '/plans?search=react&status=active',
    );
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute(
      'href',
      '/plans?search=react&status=active&page=3',
    );
  });

  it.each([
    ['not_started', 'Not started', '(0)'],
    ['active', 'Active', '(1)'],
    ['inactive', 'Inactive', '(0)'],
    ['completed', 'Completed', '(1)'],
  ] satisfies [FilterStatus, string, string][])(
    'renders aggregate count for %s filter',
    (_, label, count) => {
      renderPlansList();

      expect(
        within(screen.getByRole('tablist')).getByRole('link', {
          name: new RegExp(label),
        }),
      ).toHaveTextContent(count);
    },
  );
});
