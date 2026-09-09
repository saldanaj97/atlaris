import type {
  PlanListItem,
  PlanListPage,
  PlanListQuery,
  PlanListStatusCounts,
} from '@/features/plans/read-projection/types';
import type React from 'react';

import { getPlanCoverImage } from '@/app/(app)/plans/components/plan-utils';
import { PlansList } from '@/app/(app)/plans/components/PlansList';
import {
  PLAN_LIST_PAGE_SIZE,
  PLAN_LIST_SORTS,
} from '@/features/plans/read-projection/types';
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

  const lockedPlan: PlanListItem = {
    id: 'plan-locked',
    topic: 'Locked Research',
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-05-15T00:00:00.000Z',
    status: 'active',
    completion: 0.4,
    completedTasks: 8,
    totalTasks: 20,
    access: 'locked',
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
        canCreatePlan: true,
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
    expect(screen.getByRole('link', { name: 'New plan' })).toHaveAttribute(
      'href',
      '/plans/new',
    );
  });

  it('routes the empty-state CTA to pricing after lifetime access is used', () => {
    renderPlansList({
      page: {
        items: [],
        totalItems: 0,
        totalPages: 0,
        totalSearchResults: 0,
        canCreatePlan: false,
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

    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(
      screen.queryByRole('link', { name: 'New plan' }),
    ).not.toBeInTheDocument();
  });

  it('renders correct link for each plan', () => {
    renderPlansList();

    const planLinks = [
      within(
        screen.getByRole('heading', { name: 'Master React Hooks' }),
      ).getByRole('link'),
      within(
        screen.getByRole('heading', { name: 'Learn TypeScript' }),
      ).getByRole('link'),
    ];
    expect(planLinks).toHaveLength(2);
    expect(planLinks[0]).toHaveAttribute('href', '/plans/plan-1');
    expect(planLinks[1]).toHaveAttribute('href', '/plans/plan-2');
  });

  it('renders plans as cards with the status filter rail', () => {
    renderPlansList();

    expect(
      screen.getByRole('list', { name: 'Learning plans' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Plan status filters' }),
    ).toBeInTheDocument();
    for (const heading of ['All plans', 'Active', 'Completed', 'Generating']) {
      expect(
        screen.getByRole('link', { name: new RegExp(heading) }),
      ).toBeInTheDocument();
    }
  });

  it('uses a stable cover from the fixed artwork set', () => {
    const allowedCovers = new Set([
      '/artwork/cover-mountain-summit.jpg',
      '/artwork/cover-observatory-night.jpg',
      '/artwork/cover-lake-forest-dusk.jpg',
      '/artwork/cover-coastal-inlet-dawn.jpg',
      '/artwork/cover-planetary-horizon.jpg',
    ]);
    const cover = getPlanCoverImage(activePlan.id);

    expect(getPlanCoverImage(activePlan.id)).toBe(cover);
    expect(allowedCovers.has(cover)).toBe(true);
  });

  it('builds server-backed sort links in the sort menu', async () => {
    const user = userEvent.setup();
    renderPlansList({
      query: {
        search: 'react hooks',
        status: 'active',
        sort: 'topic_asc',
      },
    });

    await user.click(screen.getByRole('button', { name: /Sort:/i }));
    const menuItems = within(screen.getByRole('menu')).getAllByRole('menuitem');
    const menuSorts = menuItems.map((item) => {
      const href = item.getAttribute('href');
      return (
        new URL(href ?? '', 'http://localhost').searchParams.get('sort') ??
        'recommended'
      );
    });
    expect(new Set(menuSorts)).toEqual(new Set(PLAN_LIST_SORTS));
    expect(menuSorts).toHaveLength(PLAN_LIST_SORTS.length);
    expect(screen.getByRole('menuitem', { name: 'Name A–Z' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('menuitem', { name: 'Name Z–A' })).toHaveAttribute(
      'href',
      '/plans?search=react+hooks&status=active&sort=topic_desc',
    );
    expect(
      screen.getByRole('menuitem', { name: 'Progress high to low' }),
    ).toHaveAttribute(
      'href',
      '/plans?search=react+hooks&status=active&sort=progress_desc',
    );
    expect(
      screen.getByRole('menuitem', { name: 'Recently updated' }),
    ).toHaveAttribute(
      'href',
      '/plans?search=react+hooks&status=active&sort=recently_updated',
    );
  });

  it.each([
    ['status_desc', 'Status descending'],
    ['updated_asc', 'Oldest updated'],
  ] as const)('shows the active label for %s', async (sort, label) => {
    const user = userEvent.setup();
    renderPlansList({ query: { sort } });

    const sortButton = screen.getByRole('button', { name: new RegExp(label) });
    expect(sortButton).toBeInTheDocument();
    await user.click(sortButton);
    expect(screen.getByRole('menuitem', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('uses the filtered total for the grid summary and search total for All plans', () => {
    renderPlansList({
      page: {
        items: [activePlan],
        totalItems: 1,
        totalSearchResults: 2,
      },
      query: { status: 'active' },
    });

    expect(screen.getByText('1 plan')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Plan status filters' }),
      ).getByRole('link', { name: /All plans\s*2/ }),
    ).toBeInTheDocument();
  });

  it('labels a locked plan timestamp as Updated and uses updatedAt', () => {
    renderPlansList({
      page: {
        items: [lockedPlan],
        totalItems: 1,
        totalSearchResults: 1,
      },
    });

    const card = screen
      .getByRole('heading', { name: 'Locked Research' })
      .closest('li');
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Updated')).toBeInTheDocument();
    expect(within(card!).queryByText('Added')).not.toBeInTheDocument();
    expect(card!.querySelector('time')).toHaveAttribute(
      'dateTime',
      lockedPlan.updatedAt!,
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
      within(
        screen.getByRole('heading', { name: 'Master React Hooks' }),
      ).getByRole('link'),
    ).toHaveAttribute('href', '/plans/plan-1');

    const rowCheckbox = screen.getByRole('checkbox', {
      name: 'Select Master React Hooks',
    });
    await user.click(rowCheckbox.closest('label')!);

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
      within(
        screen.getByRole('heading', { name: 'Learn TypeScript' }),
      ).getByRole('link'),
    ).toHaveAttribute('href', '/plans/plan-2');
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

  it('keeps generating and failed cards honest without fabricated copy', () => {
    renderPlansList({
      page: {
        items: [
          {
            ...completedPlan,
            id: 'plan-generating',
            topic: 'Generating Plan',
            status: 'generating',
            completion: 0,
            completedTasks: 0,
            totalTasks: 0,
          },
          {
            ...completedPlan,
            id: 'plan-failed',
            topic: 'Failed Plan',
            status: 'failed',
            completion: 0,
            completedTasks: 0,
            totalTasks: 0,
          },
        ],
        totalItems: 2,
        totalSearchResults: 2,
      },
    });

    const list = screen.getByRole('list', { name: 'Learning plans' });
    const generatingCard = screen
      .getByRole('heading', { name: 'Generating Plan' })
      .closest('li');
    const failedCard = screen
      .getByRole('heading', { name: 'Failed Plan' })
      .closest('li');

    expect(generatingCard).not.toBeNull();
    expect(failedCard).not.toBeNull();
    expect(list.contains(generatingCard)).toBe(true);
    expect(list.contains(failedCard)).toBe(true);
    expect(generatingCard).toHaveTextContent(
      'Your learning path is being prepared.',
    );
    expect(
      within(generatingCard!).getByRole('link', { name: /View progress/ }),
    ).toHaveAttribute('href', '/plans/plan-generating');
    expect(failedCard).toHaveTextContent("We couldn't generate this plan.");
    expect(
      within(failedCard!).getByRole('link', { name: /View plan/ }),
    ).toHaveAttribute('href', '/plans/plan-failed');
    expect(list).not.toHaveTextContent('No credits were used');
    expect(list).not.toHaveTextContent('1-2 minutes');
    expect(list).not.toHaveTextContent('Browse templates');
  });

  it('exposes table-equivalent fields from one card list', () => {
    renderPlansList();

    expect(
      screen.getAllByRole('list', { name: 'Learning plans' }),
    ).toHaveLength(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const card = screen
      .getByRole('heading', { name: 'Master React Hooks' })
      .closest('li');
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Active')).toBeInTheDocument();
    expect(within(card!).getByText('Progress')).toBeInTheDocument();
    expect(within(card!).getByText('40%')).toBeInTheDocument();
    expect(within(card!).getByText('Tasks')).toBeInTheDocument();
    expect(within(card!).getByText('8 / 20')).toBeInTheDocument();
    expect(within(card!).getByText('Updated')).toBeInTheDocument();
    expect(
      within(card!).getByRole('link', { name: /Continue learning/ }),
    ).toHaveAttribute('href', '/plans/plan-1');
    expect(
      within(card!).getByRole('button', {
        name: 'Actions for Master React Hooks',
      }),
    ).toBeInTheDocument();
  });

  it('selects all deletable plans on the current page', async () => {
    const user = userEvent.setup();
    renderPlansList();

    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: 'Select all plans on page',
    });
    await user.click(selectAllCheckbox.closest('label')!);

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
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Plans cannot be deleted right now.',
    );
    expect(toast.error).not.toHaveBeenCalled();
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
