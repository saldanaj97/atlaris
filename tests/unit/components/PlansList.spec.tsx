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
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefresh = vi.fn();

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
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

import { toast } from 'sonner';

describe('PlansList', () => {
  const referenceTimestamp = '2024-06-01T00:00:00.000Z';

  beforeEach(() => {
    mockRefresh.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

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
      sort: 'recommended',
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
    ).toHaveAttribute('href', '/plans?search=react+hooks&status=active');
  });

  it('renders sort control with the current selected value', () => {
    renderPlansList({
      query: { sort: 'recently_updated' },
    });

    expect(screen.getByLabelText('Sort learning plans')).toHaveValue(
      'recently_updated',
    );
  });

  it('preserves sort in filter tab links and pagination links', () => {
    renderPlansList({
      page: { page: 2, totalPages: 3, totalItems: 45 },
      query: { page: 2, search: 'react', status: 'active', sort: 'newest' },
    });

    expect(
      within(screen.getByRole('tablist')).getByRole('link', {
        name: /Completed/,
      }),
    ).toHaveAttribute(
      'href',
      '/plans?search=react&status=completed&sort=newest',
    );
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute(
      'href',
      '/plans?search=react&status=active&sort=newest',
    );
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute(
      'href',
      '/plans?search=react&status=active&sort=newest&page=3',
    );
  });

  it('includes hidden status in the search form without preserving page', () => {
    renderPlansList({
      page: { page: 2, totalPages: 3 },
      query: {
        page: 2,
        search: 'typescript',
        status: 'completed',
        sort: 'newest',
      },
    });

    const searchForm = screen.getByRole('searchbox').closest('form');
    expect(searchForm).not.toBeNull();
    expect(within(searchForm!).getByDisplayValue('completed')).toHaveAttribute(
      'name',
      'status',
    );
    expect(within(searchForm!).getByDisplayValue('newest')).toHaveAttribute(
      'name',
      'sort',
    );
    expect(within(searchForm!).queryByDisplayValue('2')).toBeNull();
  });

  it('enters selection mode and toggles row checkboxes', async () => {
    const user = userEvent.setup();
    renderPlansList();

    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/plans/')),
    ).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Select' }));

    expect(screen.getByLabelText('Bulk plan actions')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select Master React Hooks' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select Learn TypeScript' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/plans/')),
    ).toHaveLength(0);
  });

  it('disables selection for generating plans', async () => {
    const user = userEvent.setup();
    renderPlansList({
      page: {
        items: [
          activePlan,
          {
            ...completedPlan,
            id: 'plan-generating',
            topic: 'Generating Plan',
            status: 'generating',
          },
        ],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Select' }));

    expect(
      screen.getByRole('checkbox', {
        name: 'Cannot select Generating Plan while it is generating',
      }),
    ).toBeDisabled();
  });

  it('selects all deletable plans on the current page', async () => {
    const user = userEvent.setup();
    renderPlansList();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(
      screen.getByRole('button', { name: 'Select all on page' }),
    );

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select Master React Hooks' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Select Learn TypeScript' }),
    ).toBeChecked();
  });

  it('clears the current selection', async () => {
    const user = userEvent.setup();
    renderPlansList();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(
      screen.getByRole('button', { name: 'Select all on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select Master React Hooks' }),
    ).not.toBeChecked();
  });

  it('opens bulk delete confirmation with selected plan topics', async () => {
    const user = userEvent.setup();
    renderPlansList();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(
      screen.getByRole('button', { name: 'Select all on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));

    expect(screen.getByText('Delete selected plans')).toBeInTheDocument();
    expect(
      screen.getByText(/Master React Hooks, Learn TypeScript/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete 2 plans' }),
    ).toBeInTheDocument();
  });

  it('pluralizes the bulk delete action for one selected plan', async () => {
    const user = userEvent.setup();
    renderPlansList();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Master React Hooks' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));

    expect(
      screen.getByRole('button', { name: 'Delete 1 plan' }),
    ).toBeInTheDocument();
  });

  it('refreshes and exits selection mode after a successful bulk delete', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          deletedCount: 2,
          failedCount: 0,
          results: [
            { planId: 'plan-1', success: true },
            { planId: 'plan-2', success: true },
          ],
        }),
        { status: 200 },
      ),
    );
    renderPlansList();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(
      screen.getByRole('button', { name: 'Select all on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/plans/bulk-delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ planIds: ['plan-1', 'plan-2'] }),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Deleted 2 plans');
    expect(mockRefresh).toHaveBeenCalled();
    expect(
      screen.queryByLabelText('Bulk plan actions'),
    ).not.toBeInTheDocument();
  });

  it('shows a partial failure toast and keeps selection mode open', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          deletedCount: 1,
          failedCount: 1,
          results: [
            { planId: 'plan-1', success: true },
            {
              planId: 'plan-2',
              success: false,
              reason: 'currently_generating',
              message: 'Cannot delete a plan that is currently generating.',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    renderPlansList();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(
      screen.getByRole('button', { name: 'Select all on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

    expect(toast.error).toHaveBeenCalledWith(
      'Deleted 1 plans. 1 could not be deleted.',
    );
    expect(
      screen.getByText(
        'Some plans started generating and could not be deleted.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Bulk plan actions')).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('resets page when submitting search or changing filters', () => {
    renderPlansList({
      page: { page: 2, totalPages: 3 },
      query: { page: 2, search: 'typescript', status: 'completed' },
    });

    const searchForm = screen.getByRole('searchbox').closest('form');
    expect(searchForm).not.toBeNull();
    expect(screen.getByRole('searchbox')).toHaveValue('typescript');
    expect(within(searchForm!).getByDisplayValue('completed')).toHaveAttribute(
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
