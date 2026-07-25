'use client';

import type {
  FilterStatus,
  PlanListItem,
  PlanListPage,
  PlanListQuery,
  PlanListSort,
  PlanReadStatus,
} from '@/features/plans/read-projection/types';

import {
  BulkDeletePlansDialog,
  type BulkDeletePlansResult,
} from '@/app/(app)/plans/components/BulkDeletePlansDialog';
import { EmptyPlansList } from '@/app/(app)/plans/components/EmptyPlansList';
import { PlanRow } from '@/app/(app)/plans/components/PlanRow';
import { getPlanStatusDotClassName } from '@/app/(app)/plans/plan-status-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface PlansListProps {
  page: PlanListPage;
  query: PlanListQuery;
}

const FILTER_TABS: {
  id: FilterStatus;
  label: string;
  status?: PlanReadStatus;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'not_started', label: 'Not started', status: 'not_started' },
  { id: 'active', label: 'Active', status: 'active' },
  { id: 'completed', label: 'Completed', status: 'completed' },
  { id: 'inactive', label: 'Inactive', status: 'paused' },
  { id: 'generating', label: 'Generating', status: 'generating' },
  { id: 'failed', label: 'Failed', status: 'failed' },
];

const SORT_OPTIONS: { value: PlanListSort; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'recently_updated', label: 'Recently updated' },
  { value: 'newest', label: 'Newest' },
];

function isPlanBulkDeletable(plan: PlanListItem): boolean {
  return plan.status !== 'generating';
}

function plansHref(params: {
  search: string;
  status: FilterStatus;
  sort: PlanListSort;
  page?: number;
}): string {
  const searchParams = new URLSearchParams();

  if (params.search) {
    searchParams.set('search', params.search);
  }
  if (params.status !== 'all') {
    searchParams.set('status', params.status);
  }
  if (params.sort !== 'recommended') {
    searchParams.set('sort', params.sort);
  }
  if (params.page && params.page > 1) {
    searchParams.set('page', String(params.page));
  }

  const queryString = searchParams.toString();
  return queryString ? `/plans?${queryString}` : '/plans';
}

function getFilterCount(
  tab: (typeof FILTER_TABS)[number],
  page: PlanListPage,
): number {
  if (tab.id === 'all') return page.totalSearchResults;
  if (tab.id === 'inactive') return page.statusCounts.paused;
  return tab.status ? page.statusCounts[tab.status] : 0;
}

function BulkPlanActionsToolbar({
  selectedCount,
  deletableCount,
  toolbarMessage,
  onClear,
  onDelete,
}: {
  selectedCount: number;
  deletableCount: number;
  toolbarMessage: string | null;
  onClear: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className='space-y-3 rounded-xl border border-panel-border bg-panel px-4 py-3'
      aria-label='Bulk plan actions'
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='space-y-1'>
          <p className='text-sm font-medium text-foreground'>
            <span
              key={selectedCount}
              className='inline-block animate-in tabular-nums duration-200 fill-mode-both fade-in slide-in-from-bottom-1 motion-reduce:animate-none'
            >
              {selectedCount}
            </span>{' '}
            selected
          </p>
          {toolbarMessage ? (
            <p className='text-sm text-destructive'>{toolbarMessage}</p>
          ) : deletableCount === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No deletable plans on this page.
            </p>
          ) : null}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={onClear}
            disabled={selectedCount === 0}
          >
            Clear
          </Button>
          <Button
            type='button'
            variant='destructive'
            size='sm'
            className='ml-1'
            onClick={onDelete}
            disabled={selectedCount === 0}
          >
            Delete selected
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlansControls({
  page,
  query,
  selectableCount,
  selectedSelectableCount,
  onSelectAll,
  onDeselectAll,
}: {
  page: PlanListPage;
  query: PlanListQuery;
  selectableCount: number;
  selectedSelectableCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const router = useRouter();
  const allSelected =
    selectableCount > 0 && selectedSelectableCount === selectableCount;
  const someSelected =
    selectedSelectableCount > 0 && selectedSelectableCount < selectableCount;

  return (
    <div className='space-y-4'>
      {/* Search row: Search primary; Sort trails on the right (sm+). */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2'>
        <form action='/plans' className='relative w-full min-w-0 flex-1'>
          <Search
            className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden='true'
          />
          {query.status !== 'all' ? (
            <input type='hidden' name='status' value={query.status} />
          ) : null}
          {query.sort !== 'recommended' ? (
            <input type='hidden' name='sort' value={query.sort} />
          ) : null}
          <Input
            type='search'
            name='search'
            placeholder='Search plans...'
            aria-label='Search learning plans'
            className='h-9 w-full border-panel-border bg-panel pl-9'
            defaultValue={query.search}
          />
        </form>

        <div className='flex shrink-0 items-center gap-1.5 sm:gap-2'>
          <form
            action='/plans'
            className='flex h-8 shrink-0 items-center gap-1.5'
          >
            <label
              htmlFor='plans-sort'
              className='inline-flex h-8 items-center text-xs leading-none font-medium tracking-wide text-muted-foreground uppercase'
            >
              Sort
            </label>
            {query.search ? (
              <input type='hidden' name='search' value={query.search} />
            ) : null}
            {query.status !== 'all' ? (
              <input type='hidden' name='status' value={query.status} />
            ) : null}
            <select
              id='plans-sort'
              name='sort'
              defaultValue={query.sort}
              onChange={(event) =>
                router.push(
                  plansHref({
                    search: query.search,
                    status: query.status,
                    sort: event.currentTarget.value as PlanListSort,
                  }),
                )
              }
              className='h-8 max-w-[10.5rem] truncate rounded-md border border-panel-border bg-panel px-2 text-sm leading-none shadow-xs dark:bg-panel'
              aria-label='Sort learning plans'
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </form>
        </div>
      </div>

      {/* Filter rail: select-all + status tabs share one hairline underline. */}
      <div className='flex w-full items-center gap-2 border-b border-border'>
        <div className='flex shrink-0 items-center self-stretch px-2'>
          <input
            type='checkbox'
            checked={allSelected}
            disabled={selectableCount === 0}
            aria-label='Select all plans on page'
            ref={(element) => {
              if (element) {
                element.indeterminate = someSelected;
              }
            }}
            onChange={(event) => {
              if (event.currentTarget.checked) {
                onSelectAll();
                return;
              }
              onDeselectAll();
            }}
            className='size-4 shrink-0 rounded border border-border accent-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
          />
        </div>
        <Tabs
          value={query.status}
          aria-label='Filter plans by status'
          className='min-w-0 flex-1'
        >
          <TabsList className='h-auto w-full justify-start gap-4 overflow-x-auto rounded-none border-0 bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden'>
            {FILTER_TABS.map((tab) => {
              const count = getFilterCount(tab, page);
              return (
                <TabsTrigger
                  asChild
                  key={tab.id}
                  value={tab.id}
                  className='group -mb-px inline-flex shrink-0 items-center gap-1.5 rounded-none border-0 border-b-2 border-transparent px-0.5 pt-1 pb-2 text-sm text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent'
                >
                  <Link
                    href={plansHref({
                      search: query.search,
                      status: tab.id,
                      sort: query.sort,
                    })}
                  >
                    {tab.status ? (
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          getPlanStatusDotClassName(tab.status),
                        )}
                        aria-hidden='true'
                      />
                    ) : null}
                    <span>{tab.label}</span>
                    <span className='text-xs text-muted-foreground tabular-nums'>
                      {count}
                    </span>
                  </Link>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}

export function PlansList({ page, query }: PlansListProps) {
  const router = useRouter();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [toolbarMessage, setToolbarMessage] = useState<string | null>(null);
  const deletablePlans: PlanListItem[] = [];
  const selectedDeletablePlans: PlanListItem[] = [];

  for (const plan of page.items) {
    if (!isPlanBulkDeletable(plan)) {
      continue;
    }
    deletablePlans.push(plan);
    if (selectedPlanIds.has(plan.id)) {
      selectedDeletablePlans.push(plan);
    }
  }

  const handleSelectionChange = (planId: string, selected: boolean): void => {
    // Hover-checkbox on a row can enter selection mode without the toolbar.
    if (selected) {
      setSelectionMode(true);
      setSelectedPlanIds((current) => {
        const next = new Set(current);
        next.add(planId);
        return next;
      });
      setToolbarMessage(null);
      return;
    }

    const next = new Set(selectedPlanIds);
    next.delete(planId);
    // Last unchecked plan: exit selection mode (same cleanup as Clear).
    if (next.size === 0) {
      setSelectionMode(false);
      setSelectedPlanIds(() => new Set());
      setToolbarMessage(null);
      return;
    }
    setSelectedPlanIds(next);
    setToolbarMessage(null);
  };

  const handleSelectAllOnPage = (): void => {
    setSelectionMode(true);
    setSelectedPlanIds(() => new Set(deletablePlans.map((plan) => plan.id)));
    setToolbarMessage(null);
  };

  // Clear / last unchecked / select-all uncheck: same exit.
  const handleCancelSelectionMode = (): void => {
    setSelectionMode(false);
    setSelectedPlanIds(() => new Set());
    setToolbarMessage(null);
  };

  const handleBulkDeleted = (result: BulkDeletePlansResult): void => {
    const deletedIds = new Set<string>();
    const failedResults: Extract<
      BulkDeletePlansResult['results'][number],
      { success: false }
    >[] = [];

    for (const entry of result.results) {
      if (entry.success) {
        deletedIds.add(entry.planId);
      } else {
        failedResults.push(entry);
      }
    }

    setSelectedPlanIds((current) => {
      const next = new Set(
        [...current].filter((planId) => !deletedIds.has(planId)),
      );
      return next;
    });

    if (result.deletedCount > 0 && result.failedCount === 0) {
      toast.success(
        `Deleted ${result.deletedCount} plan${result.deletedCount === 1 ? '' : 's'}`,
      );
      setSelectionMode(false);
      setSelectedPlanIds(() => new Set());
      setToolbarMessage(null);
      router.refresh();
      return;
    }

    if (result.deletedCount > 0 && result.failedCount > 0) {
      toast.error(
        `Deleted ${result.deletedCount} plans. ${result.failedCount} could not be deleted.`,
      );
      const hasGeneratingFailure = failedResults.some(
        (entry) => entry.reason === 'currently_generating',
      );
      setToolbarMessage(
        hasGeneratingFailure
          ? 'Some plans started generating and could not be deleted.'
          : (failedResults[0]?.message ?? null),
      );
      router.refresh();
      return;
    }

    toast.error('No plans were deleted');
    setToolbarMessage(failedResults[0]?.message ?? null);
  };

  const showBulkToolbar = selectionMode && selectedPlanIds.size > 0;

  return (
    <div className='space-y-5'>
      <div>
        <PlansControls
          page={page}
          query={query}
          selectableCount={deletablePlans.length}
          selectedSelectableCount={selectedDeletablePlans.length}
          onSelectAll={handleSelectAllOnPage}
          onDeselectAll={handleCancelSelectionMode}
        />

        {/* Height-collapse so the plan list eases down/up with the toolbar. */}
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
            showBulkToolbar ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
          aria-hidden={!showBulkToolbar}
        >
          <div
            className={cn(
              'min-h-0 overflow-hidden',
              showBulkToolbar ? null : 'pointer-events-none',
            )}
          >
            <div className='mt-3 mb-3'>
              <BulkPlanActionsToolbar
                selectedCount={selectedDeletablePlans.length}
                deletableCount={deletablePlans.length}
                toolbarMessage={toolbarMessage}
                onClear={handleCancelSelectionMode}
                onDelete={() => setBulkDeleteOpen(true)}
              />
            </div>
          </div>
        </div>

        <BulkDeletePlansDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          plans={selectedDeletablePlans}
          onDeleted={handleBulkDeleted}
        />

        {page.items.length === 0 ? (
          <EmptyPlansList
            searchQuery={query.search}
            filterStatus={query.status}
          />
        ) : (
          <section
            aria-label='Learning plans'
            className='divide-y divide-border/60 border-b border-border/60'
          >
            {page.items.map((plan, index) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                index={index}
                referenceTimestamp={page.referenceTimestamp}
                selectionMode={selectionMode}
                selected={selectedPlanIds.has(plan.id)}
                selectable={isPlanBulkDeletable(plan)}
                onSelectionChange={handleSelectionChange}
              />
            ))}
          </section>
        )}
      </div>

      {page.totalPages > 1 ? (
        <nav
          aria-label='Plans pagination'
          className='flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between'
        >
          <span className='tabular-nums'>
            Page {page.page} of {page.totalPages}
          </span>
          <div className='flex items-center gap-2'>
            <Button
              asChild={page.page > 1}
              variant='ghost'
              size='sm'
              disabled={page.page <= 1}
            >
              {page.page > 1 ? (
                <Link
                  href={plansHref({
                    search: query.search,
                    status: query.status,
                    sort: query.sort,
                    page: page.page - 1,
                  })}
                >
                  <ChevronLeft />
                  Previous
                </Link>
              ) : (
                <>
                  <ChevronLeft />
                  Previous
                </>
              )}
            </Button>
            <Button
              asChild={page.page < page.totalPages}
              variant='ghost'
              size='sm'
              disabled={page.page >= page.totalPages}
            >
              {page.page < page.totalPages ? (
                <Link
                  href={plansHref({
                    search: query.search,
                    status: query.status,
                    sort: query.sort,
                    page: page.page + 1,
                  })}
                >
                  Next
                  <ChevronRight />
                </Link>
              ) : (
                <>
                  Next
                  <ChevronRight />
                </>
              )}
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
