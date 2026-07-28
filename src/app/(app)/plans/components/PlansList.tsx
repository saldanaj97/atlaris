'use client';

import type {
  FilterStatus,
  PlanListItem,
  PlanListPage,
  PlanListQuery,
  PlanListSort,
} from '@/features/plans/read-projection/types';

import {
  BulkDeletePlansDialog,
  type BulkDeletePlansResult,
} from '@/app/(app)/plans/components/BulkDeletePlansDialog';
import { EmptyPlansList } from '@/app/(app)/plans/components/EmptyPlansList';
import { PlanRow } from '@/app/(app)/plans/components/PlanRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface PlansListProps {
  page: PlanListPage;
  query: PlanListQuery;
}

type SortableColumn = 'topic' | 'progress' | 'status' | 'updated';
type SortDirection = 'ascending' | 'descending';

const COLUMN_SORTS = {
  topic: ['topic_asc', 'topic_desc'],
  progress: ['progress_asc', 'progress_desc'],
  status: ['status_asc', 'status_desc'],
  updated: ['updated_asc', 'recently_updated'],
} as const satisfies Record<
  SortableColumn,
  readonly [PlanListSort, PlanListSort]
>;

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

function getSortDirection(
  sort: PlanListSort,
  column: SortableColumn,
): SortDirection | null {
  const [ascending, descending] = COLUMN_SORTS[column];
  if (sort === ascending) return 'ascending';
  if (sort === descending) return 'descending';
  return null;
}

function getNextSort(sort: PlanListSort, column: SortableColumn): PlanListSort {
  const [ascending, descending] = COLUMN_SORTS[column];
  if (sort === ascending) return descending;
  if (sort === descending) return ascending;
  return column === 'progress' || column === 'updated' ? descending : ascending;
}

function SortableTableHead({
  column,
  label,
  query,
}: {
  column: SortableColumn;
  label: string;
  query: PlanListQuery;
}) {
  const direction = getSortDirection(query.sort, column);
  const nextSort = getNextSort(query.sort, column);
  const nextDirection =
    nextSort === COLUMN_SORTS[column][0] ? 'ascending' : 'descending';

  return (
    <TableHead aria-sort={direction ?? 'none'}>
      <Button
        asChild
        variant='ghost'
        size='sm'
        className='-ml-3 h-8 px-2 text-xs font-medium uppercase'
      >
        <Link
          href={plansHref({
            search: query.search,
            status: query.status,
            sort: nextSort,
          })}
          aria-label={`Sort by ${label} ${nextDirection}`}
        >
          {label}
          {direction === 'ascending' ? (
            <ArrowUp aria-hidden='true' />
          ) : direction === 'descending' ? (
            <ArrowDown aria-hidden='true' />
          ) : (
            <ArrowUpDown aria-hidden='true' />
          )}
        </Link>
      </Button>
    </TableHead>
  );
}

function BulkPlanActionsToolbar({
  selectedCount,
  toolbarMessage,
  onClear,
  onDelete,
}: {
  selectedCount: number;
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
          ) : null}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' variant='outline' size='sm' onClick={onClear}>
            Clear
          </Button>
          <Button
            type='button'
            variant='destructive'
            size='sm'
            onClick={onDelete}
          >
            Delete selected
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlansSearch({ query }: { query: PlanListQuery }) {
  return (
    <form action='/plans' className='relative w-full'>
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
  );
}

function PlansTable({
  page,
  query,
  deletablePlans,
  selectedPlanIds,
  onSelectionChange,
  onSelectAll,
  onDeselectAll,
}: {
  page: PlanListPage;
  query: PlanListQuery;
  deletablePlans: PlanListItem[];
  selectedPlanIds: Set<string>;
  onSelectionChange: (planId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const selectedCount = deletablePlans.filter((plan) =>
    selectedPlanIds.has(plan.id),
  ).length;
  const allSelected =
    deletablePlans.length > 0 && selectedCount === deletablePlans.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <Table aria-label='Learning plans' className='min-w-[840px]'>
      <TableHeader className='bg-transparent [&_tr]:border-border/60'>
        <TableRow className='hover:bg-transparent'>
          <TableHead className='w-10 px-3'>
            <input
              type='checkbox'
              checked={allSelected}
              disabled={deletablePlans.length === 0}
              aria-label='Select all plans on page'
              ref={(element) => {
                if (element) element.indeterminate = someSelected;
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
          </TableHead>
          <SortableTableHead column='topic' label='Plan' query={query} />
          <SortableTableHead column='progress' label='Progress' query={query} />
          <TableHead className='text-xs uppercase'>Tasks</TableHead>
          <SortableTableHead column='status' label='Status' query={query} />
          <SortableTableHead column='updated' label='Updated' query={query} />
          <TableHead className='w-12'>
            <span className='sr-only'>Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='[&_tr:last-child]:border-b [&_tr:last-child]:border-border/60'>
        {page.items.map((plan, index) => (
          <PlanRow
            key={plan.id}
            plan={plan}
            index={index}
            referenceTimestamp={page.referenceTimestamp}
            selected={selectedPlanIds.has(plan.id)}
            selectable={isPlanBulkDeletable(plan)}
            onSelectionChange={onSelectionChange}
          />
        ))}
      </TableBody>
    </Table>
  );
}

export function PlansList({ page, query }: PlansListProps) {
  const router = useRouter();
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [toolbarMessage, setToolbarMessage] = useState<string | null>(null);
  const deletablePlans = page.items.filter(isPlanBulkDeletable);
  const selectedDeletablePlans = deletablePlans.filter((plan) =>
    selectedPlanIds.has(plan.id),
  );

  const handleSelectionChange = (planId: string, selected: boolean): void => {
    setSelectedPlanIds((current) => {
      const next = new Set(current);
      if (selected) next.add(planId);
      else next.delete(planId);
      return next;
    });
    setToolbarMessage(null);
  };

  const handleSelectAllOnPage = (): void => {
    setSelectedPlanIds(new Set(deletablePlans.map((plan) => plan.id)));
    setToolbarMessage(null);
  };

  const handleClearSelection = (): void => {
    setSelectedPlanIds(new Set());
    setToolbarMessage(null);
  };

  const handleBulkDeleted = (result: BulkDeletePlansResult): void => {
    const deletedIds = new Set<string>();
    const failedResults: Extract<
      BulkDeletePlansResult['results'][number],
      { success: false }
    >[] = [];

    for (const entry of result.results) {
      if (entry.success) deletedIds.add(entry.planId);
      else failedResults.push(entry);
    }

    setSelectedPlanIds(
      (current) =>
        new Set([...current].filter((planId) => !deletedIds.has(planId))),
    );

    if (result.deletedCount > 0 && result.failedCount === 0) {
      toast.success(
        `Deleted ${result.deletedCount} plan${result.deletedCount === 1 ? '' : 's'}`,
      );
      handleClearSelection();
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
      <PlansSearch query={query} />

      {selectedDeletablePlans.length > 0 ? (
        <BulkPlanActionsToolbar
          selectedCount={selectedDeletablePlans.length}
          toolbarMessage={toolbarMessage}
          onClear={handleClearSelection}
          onDelete={() => setBulkDeleteOpen(true)}
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
        <PlansTable
          page={page}
          query={query}
          deletablePlans={deletablePlans}
          selectedPlanIds={selectedPlanIds}
          onSelectionChange={handleSelectionChange}
          onSelectAll={handleSelectAllOnPage}
          onDeselectAll={handleClearSelection}
        />
      )}

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
