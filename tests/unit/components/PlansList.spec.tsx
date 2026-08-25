import type {
  PlanListItem,
  PlanListPage,
  PlanListQuery,
  PlanListStatusCounts,
} from '@/features/plans/read-projection/types';
import type React from 'react';

import { PlansList } from '@/app/(app)/plans/components/PlansList';
import { PLAN_LIST_PAGE_SIZE } from '@/features/plans/read-projection/types';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

import { toast } from 'sonner';

describe('PlansList', () => {
  const referenceTimestamp = '2024-06-01T00:00:00.000Z';

  beforeEach(() => {
    mockPush.mockReset();
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
      screen.getByText(/Create a plan and pick up when the night is quiet/i),
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

  it('renders plans in a table without the status tab rail', () => {
    renderPlansList();

    expect(
      screen.getByRole('table', { name: 'Learning plans' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    for (const heading of ['Plan', 'Progress', 'Status', 'Updated']) {
      expect(
        screen.getByRole('columnheader', { name: new RegExp(heading) }),
      ).toBeInTheDocument();
    }
  });

  it('builds server-backed heading sort links and exposes sort direction', () => {
    renderPlansList({
      query: {
        search: 'react hooks',
        status: 'active',
        sort: 'topic_asc',
      },
    });

    expect(screen.getByRole('columnheader', { name: /Plan/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('link', { name: /Sort by plan/i })).toHaveAttribute(
      'href',
      '/plans?search=react+hooks&status=active&sort=topic_desc',
    );
    expect(
      screen.getByRole('link', { name: /Sort by progress/i }),
    ).toHaveAttribute(
      'href',
      '/plans?search=react+hooks&status=active&sort=progress_desc',
    );
    expect(
      screen.getByRole('link', { name: /Sort by updated/i }),
    ).toHaveAttribute(
      'href',
      '/plans?search=react+hooks&status=active&sort=recently_updated',
    );
  });

  it('retains status in searches and exposes a clear-filter link', () => {
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
    expect(
      screen.getByRole('link', { name: 'Clear completed filter' }),
    ).toHaveAttribute('href', '/plans?search=typescript&sort=newest');
  });

  it('selects a row without hiding plan links', async () => {
    const user = userEvent.setup();
    renderPlansList();

    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/plans/')),
    ).toHaveLength(2);

    await user.click(
      screen.getByRole('checkbox', { name: 'Select Master React Hooks' }),
    );

    expect(
      screen.getByRole('group', { name: 'Bulk plan actions' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select Master React Hooks' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Select Learn TypeScript' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/plans/')),
    ).toHaveLength(2);
  });

  it('disables selection for generating plans', () => {
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

    expect(
      screen.getByRole('checkbox', {
        name: 'Cannot select Generating Plan while it is generating',
      }),
    ).toBeDisabled();
  });

  it('selects all deletable plans on the current page', async () => {
    const user = userEvent.setup();
    renderPlansList();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
    );

    expect(screen.getByLabelText('Bulk plan actions')).toHaveTextContent(
      '2 selected',
    );
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

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(
      screen.queryByRole('button', { name: 'Clear' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select Master React Hooks' }),
    ).not.toBeChecked();
  });

  it('opens bulk delete confirmation with selected plan topics', async () => {
    const user = userEvent.setup();
    renderPlansList();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
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

    await user.click(
      screen.getByRole('checkbox', { name: 'Select Master React Hooks' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));

    expect(
      screen.getByRole('button', { name: 'Delete 1 plan' }),
    ).toBeInTheDocument();
  });

  it('accepts zero and positive integer counts after a successful bulk delete', async () => {
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

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
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
      screen.queryByRole('button', { name: 'Clear' }),
    ).not.toBeInTheDocument();
  });

  it('shows a partial failure toast and keeps remaining selection', async () => {
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

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
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
    ).toHaveAttribute('aria-live', 'polite');
    expect(
      screen.getByRole('group', { name: 'Bulk plan actions' }),
    ).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('rejects a malformed bulk delete success response', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          deletedCount: 2,
          failedCount: 0,
          results: null,
        }),
        { status: 200 },
      ),
    );
    renderPlansList();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(
      'We could not confirm whether the selected plans were deleted. Refreshing the list before another deletion.',
    );
    expect(screen.queryByText('Delete selected plans')).not.toBeInTheDocument();
  });

  it.each([
    ['deletedCount', -1, 0],
    ['deletedCount', 0.5, 0],
    ['failedCount', 0, -1],
    ['failedCount', 0, 0.5],
  ])(
    'rejects a %s value that is not a non-negative integer',
    async (_field, deletedCount, failedCount) => {
      const user = userEvent.setup();
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            deletedCount,
            failedCount,
            results: [],
          }),
          { status: 200 },
        ),
      );
      renderPlansList();

      await user.click(
        screen.getByRole('checkbox', { name: 'Select all plans on page' }),
      );
      await user.click(screen.getByRole('button', { name: 'Delete selected' }));
      await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

      await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
      expect(toast.error).toHaveBeenCalledWith(
        'We could not confirm whether the selected plans were deleted. Refreshing the list before another deletion.',
      );
      expect(
        screen.queryByText('Delete selected plans'),
      ).not.toBeInTheDocument();
    },
  );

  it('reconciles bulk delete after an unknown transport failure', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValue(new Error('Network unavailable'));
    renderPlansList();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(
      'We could not confirm whether the selected plans were deleted. Refreshing the list before another deletion.',
    );
    expect(screen.queryByText('Delete selected plans')).not.toBeInTheDocument();
  });

  it('keeps bulk delete retryable after a definitive server error', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { error: 'Plans cannot be deleted right now.', code: 'CONFLICT' },
        { status: 409 },
      ),
    );
    renderPlansList();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

    expect(
      await screen.findByRole('button', { name: 'Delete 2 plans' }),
    ).toBeEnabled();
    expect(toast.error).toHaveBeenCalledWith(
      'Plans cannot be deleted right now.',
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('reconciles a timed-out bulk delete before another deletion can be opened', async () => {
    const user = userEvent.setup();
    const timeoutController = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeoutController.signal);
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          timeoutController.signal.addEventListener(
            'abort',
            () => reject(timeoutController.signal.reason),
            { once: true },
          );
        }),
    );
    renderPlansList();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all plans on page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    timeoutController.abort(new DOMException('Timed out', 'TimeoutError'));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Delete selected plans')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete selected' }),
    ).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      'We could not confirm whether the selected plans were deleted. Refreshing the list before another deletion.',
    );
    timeoutSpy.mockRestore();
  });

  it('renders stable server pagination links', () => {
    renderPlansList({
      page: { page: 2, totalPages: 3, totalItems: 45 },
      query: {
        page: 2,
        search: 'react',
        status: 'active',
        sort: 'progress_desc',
      },
    });

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute(
      'href',
      '/plans?search=react&status=active&sort=progress_desc',
    );
    expect(screen.getByRole('link', { name: /^Next$/ })).toHaveAttribute(
      'href',
      '/plans?search=react&status=active&sort=progress_desc&page=3',
    );
  });
});
