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
  ATLAS_TAB_CLASS,
  PLANS_GLASS_SURFACE,
} from '@/app/(app)/plans/components/plans-atlas-classes';
import { getPlanStatusDotClassName } from '@/app/(app)/plans/plan-status-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ListChecks, Search } from 'lucide-react';
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
}: {
  page: PlanListPage;
  query: PlanListQuery;
}) {
  const router = useRouter();

  return (
    <div className='space-y-4 border-b border-border/60 pb-5'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <form
          action='/plans'
          className='relative min-w-0 sm:max-w-sm sm:flex-1'
        >
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
            className={cn(PLANS_GLASS_SURFACE, 'h-9 pl-9')}
            defaultValue={query.search}
          />
        </form>

        <form
          action='/plans'
          className='flex shrink-0 items-center gap-2 self-end sm:self-auto'
        >
          <label
            htmlFor='plans-sort'
            className='text-xs font-medium tracking-wide text-muted-foreground uppercase'
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
            className='h-9 max-w-[11rem] truncate rounded-md border border-panel-border bg-panel px-2.5 text-sm shadow-xs dark:bg-panel'
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

      <Tabs value={query.status} aria-label='Filter plans by status'>
        <TabsList className='h-auto w-full justify-start gap-1.5 overflow-x-auto bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden'>
          {FILTER_TABS.map((tab) => {
            const count = getFilterCount(tab, page);
            return (
              <TabsTrigger
                asChild
                key={tab.id}
                value={tab.id}
                className={cn(
                  'group inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-sm',
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
                        'size-2 shrink-0 rounded-full',
                        getPlanStatusDotClassName(tab.status),
                      )}
                      aria-hidden='true'
                    />
                  ) : null}
                  <span>{tab.label}</span>
                  <span className='rounded-md bg-muted/70 px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary'>
                    {count}
                  </span>
                </Link>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
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
      <PlansControls page={page} query={query} />

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
            {page.totalItems} plan{page.totalItems === 1 ? '' : 's'}
          </p>
          {!selectionMode ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={handleEnterSelectionMode}
              disabled={deletablePlans.length === 0}
            >
              <ListChecks />
              Select
            </Button>
          ) : null}
        </div>

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
          className='flex flex-col gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between'
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
