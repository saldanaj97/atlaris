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
import {
  ATLAS_CONTROL_CLASS,
  ATLAS_HERO_SURFACE_CLASS,
  ATLAS_TAB_CLASS,
} from '@/app/(app)/plans/components/plans-atlas-classes';
import { getPlanStatusDotClassName } from '@/app/(app)/plans/plan-status-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
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

function PlansHero({ page }: { page: PlanListPage }) {
  return (
    <section
      aria-label='Plans overview'
      className={cn(
        'relative overflow-hidden rounded-2xl p-5 shadow-sm sm:p-6',
        ATLAS_HERO_SURFACE_CLASS,
      )}
    >
      <div className='flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
        <div className='min-w-0'>
          <h2 className='text-2xl font-semibold text-foreground sm:text-3xl'>
            Learning plan library
          </h2>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            A mapped library with milestone rails and calm progress cues.
          </p>
        </div>

        <div className='grid gap-3 sm:grid-cols-2 lg:min-w-[16rem]'>
          <div className='min-w-0 border-l border-border/80 pl-3'>
            <div className='text-2xl font-semibold text-foreground tabular-nums'>
              {page.statusCounts.active}
            </div>
            <div className='text-xs font-medium text-foreground'>Active</div>
            <div className='truncate text-xs text-muted-foreground'>
              In progress
            </div>
          </div>
          <div className='min-w-0 border-l border-border/80 pl-3'>
            <div className='text-2xl font-semibold text-foreground tabular-nums'>
              {page.statusCounts.completed}
            </div>
            <div className='text-xs font-medium text-foreground'>Completed</div>
            <div className='truncate text-xs text-muted-foreground'>
              Finished plans
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BulkPlanActionsToolbar({
  selectedCount,
  deletableCount,
  toolbarMessage,
  onSelectAll,
  onClear,
  onDelete,
  onCancelSelection,
}: {
  selectedCount: number;
  deletableCount: number;
  toolbarMessage: string | null;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  onCancelSelection: () => void;
}) {
  return (
    <Surface
      padding='compact'
      className={cn('space-y-3', ATLAS_CONTROL_CLASS)}
      aria-label='Bulk plan actions'
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='space-y-1'>
          <p className='text-sm font-medium text-foreground'>
            {selectedCount} selected
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
            onClick={onSelectAll}
            disabled={deletableCount === 0}
          >
            Select all on page
          </Button>
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
            onClick={onDelete}
            disabled={selectedCount === 0}
          >
            Delete selected
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onCancelSelection}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Surface>
  );
}

function PlansControls({
  page,
  query,
  selectionMode,
  onEnterSelectionMode,
  canEnterSelectionMode,
}: {
  page: PlanListPage;
  query: PlanListQuery;
  selectionMode: boolean;
  onEnterSelectionMode: () => void;
  canEnterSelectionMode: boolean;
}) {
  return (
    <Surface padding='compact' className={cn('space-y-4', ATLAS_CONTROL_CLASS)}>
      <form action='/plans' className='relative'>
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
          className='h-11 border-border bg-background pl-9 dark:bg-input/30'
          defaultValue={query.search}
        />
      </form>

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <form action='/plans' className='flex items-center gap-2'>
          <label htmlFor='plans-sort' className='text-sm text-muted-foreground'>
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
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className='h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs dark:bg-input/30'
            aria-label='Sort learning plans'
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </form>

        {!selectionMode ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={onEnterSelectionMode}
            disabled={!canEnterSelectionMode}
          >
            Select
          </Button>
        ) : null}
      </div>

      <Tabs value={query.status}>
        <TabsList className='h-auto flex-wrap gap-1 bg-transparent p-0'>
          {FILTER_TABS.map((tab) => {
            const count = getFilterCount(tab, page);
            return (
              <TabsTrigger
                asChild
                key={tab.id}
                value={tab.id}
                className={cn(
                  'rounded-lg border border-transparent px-3 py-1.5 text-sm',
                  ATLAS_TAB_CLASS,
                )}
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
                        'size-2 rounded-full',
                        getPlanStatusDotClassName(tab.status),
                      )}
                      aria-hidden='true'
                    />
                  ) : null}
                  {tab.label}
                  <span className='text-muted-foreground tabular-nums'>
                    ({count})
                  </span>
                </Link>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </Surface>
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
    setSelectedPlanIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(planId);
      } else {
        next.delete(planId);
      }
      return next;
    });
    setToolbarMessage(null);
  };

  const handleSelectAllOnPage = (): void => {
    setSelectedPlanIds(() => new Set(deletablePlans.map((plan) => plan.id)));
    setToolbarMessage(null);
  };

  const handleClearSelection = (): void => {
    setSelectedPlanIds(() => new Set());
    setToolbarMessage(null);
  };

  const handleEnterSelectionMode = (): void => {
    setSelectionMode(true);
    setToolbarMessage(null);
  };

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

  return (
    <div className='space-y-5'>
      <PlansHero page={page} />
      <PlansControls
        page={page}
        query={query}
        selectionMode={selectionMode}
        onEnterSelectionMode={handleEnterSelectionMode}
        canEnterSelectionMode={deletablePlans.length > 0}
      />

      {selectionMode ? (
        <BulkPlanActionsToolbar
          selectedCount={selectedDeletablePlans.length}
          deletableCount={deletablePlans.length}
          toolbarMessage={toolbarMessage}
          onSelectAll={handleSelectAllOnPage}
          onClear={handleClearSelection}
          onDelete={() => setBulkDeleteOpen(true)}
          onCancelSelection={handleCancelSelectionMode}
        />
      ) : null}

      <BulkDeletePlansDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        plans={selectedDeletablePlans}
        onDeleted={handleBulkDeleted}
      />

      <div>
        {page.items.length === 0 ? (
          <EmptyPlansList
            searchQuery={query.search}
            filterStatus={query.status}
          />
        ) : (
          <section aria-label='Learning plans' className='space-y-3'>
            {page.items.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
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
          className={cn(
            'mt-6 flex flex-col gap-3 rounded-2xl border p-4 text-sm text-muted-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between',
            ATLAS_CONTROL_CLASS,
          )}
        >
          <span>
            Page {page.page} of {page.totalPages}
          </span>
          <div className='flex items-center gap-2'>
            <Button
              asChild={page.page > 1}
              variant='outline'
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
              variant='outline'
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
