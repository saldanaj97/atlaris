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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PlansNextStep } from '@/components/ui/plans-next-step';
import { ROUTES } from '@/features/navigation/routes';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type RefObject, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

interface PlansListProps {
  page: PlanListPage;
  query: PlanListQuery;
}

const FILTER_OPTIONS: ReadonlyArray<{
  value: FilterStatus;
  label: string;
  countKey?: keyof PlanListPage['statusCounts'];
}> = [
  { value: 'all', label: 'All plans' },
  { value: 'active', label: 'Active', countKey: 'active' },
  { value: 'not_started', label: 'Not started', countKey: 'not_started' },
  { value: 'completed', label: 'Completed', countKey: 'completed' },
  { value: 'generating', label: 'Generating', countKey: 'generating' },
  { value: 'failed', label: 'Failed', countKey: 'failed' },
  { value: 'inactive', label: 'Inactive', countKey: 'paused' },
];

const SORT_OPTIONS: ReadonlyArray<{
  value: PlanListSort;
  label: string;
}> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'recently_updated', label: 'Recently updated' },
  { value: 'newest', label: 'Newest' },
  { value: 'topic_asc', label: 'Name A–Z' },
  { value: 'topic_desc', label: 'Name Z–A' },
  { value: 'progress_desc', label: 'Progress high to low' },
  { value: 'progress_asc', label: 'Progress low to high' },
  { value: 'status_asc', label: 'Status' },
  { value: 'status_desc', label: 'Status descending' },
  { value: 'updated_asc', label: 'Oldest updated' },
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
  return queryString
    ? `${ROUTES.PLANS.ROOT}?${queryString}`
    : ROUTES.PLANS.ROOT;
}

function PlansStatusRail({
  page,
  query,
}: {
  page: PlanListPage;
  query: PlanListQuery;
}) {
  return (
    <nav
      aria-label='Plan status filters'
      className='min-w-0 overflow-hidden rounded-[12px] border border-panel-border bg-panel'
    >
      <div className='overflow-x-auto'>
        <ul className='flex min-w-max items-center gap-1 p-1'>
          {FILTER_OPTIONS.map((option) => {
            const isCurrent = option.value === query.status;
            const count =
              option.value === 'all'
                ? page.totalSearchResults
                : option.countKey
                  ? page.statusCounts[option.countKey]
                  : 0;

            return (
              <li key={option.value}>
                <Link
                  href={plansHref({
                    search: query.search,
                    status: option.value,
                    sort: query.sort,
                  })}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`flex min-h-[40px] items-center gap-2 rounded-[8px] px-3 text-sm whitespace-nowrap transition-colors [@media(pointer:coarse)]:min-h-[44px] ${
                    isCurrent
                      ? 'bg-primary/10 font-medium text-primary shadow-xs'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  {option.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                      isCurrent
                        ? 'bg-primary/15 text-primary'
                        : 'bg-panel-muted text-muted-foreground'
                    }`}
                  >
                    {count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function PlansSearch({
  query,
  searchInputRef,
}: {
  query: PlanListQuery;
  searchInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className='flex w-full min-w-0 flex-1 flex-col items-stretch gap-2 sm:flex-row sm:items-center'>
      <form
        action={ROUTES.PLANS.ROOT}
        className='relative w-full min-w-0 flex-1'
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
          ref={searchInputRef}
          type='search'
          name='search'
          placeholder='Search plans...'
          aria-label='Search learning plans'
          className='min-h-[40px] w-full border-panel-border bg-panel pl-[36px]'
          defaultValue={query.search}
        />
      </form>
      {query.status !== 'all' ? (
        <Link
          href={plansHref({
            search: query.search,
            status: 'all',
            sort: query.sort,
          })}
          className='shrink-0 self-start text-xs font-medium text-link hover:text-link-hover hover:underline sm:self-auto'
        >
          Clear{' '}
          {(
            FILTER_OPTIONS.find((option) => option.value === query.status)
              ?.label ?? query.status
          ).toLowerCase()}{' '}
          filter
        </Link>
      ) : null}
    </div>
  );
}

function PlansSort({ query }: { query: PlanListQuery }) {
  const currentLabel =
    SORT_OPTIONS.find((option) => option.value === query.sort)?.label ??
    'Recommended';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' className='w-full shrink-0 sm:w-auto'>
          <ListFilter aria-hidden='true' />
          <span className='hidden sm:inline'>Sort:</span>
          <span className='max-w-[9rem] truncate'>{currentLabel}</span>
          <ChevronDown aria-hidden='true' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>Sort plans</DropdownMenuLabel>
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.value} asChild>
            <Link
              href={plansHref({
                search: query.search,
                status: query.status,
                sort: option.value,
              })}
              aria-current={query.sort === option.value ? 'page' : undefined}
            >
              {option.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkPlanActionsToolbar({
  selectedCount,
  toolbarMessage,
  deleteDisabled,
  onClear,
  onDelete,
  deleteButtonRef,
}: {
  selectedCount: number;
  toolbarMessage: string | null;
  deleteDisabled: boolean;
  onClear: () => void;
  onDelete: () => void;
  deleteButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <fieldset
      className='m-0 min-w-0 space-y-3 rounded-[12px] border border-panel-border bg-panel px-4 py-3'
      aria-label='Bulk plan actions'
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='space-y-1'>
          <p className='text-sm font-medium text-foreground'>
            <span
              key={selectedCount}
              className='inline-block animate-in tabular-nums animation-duration-200 fill-mode-both fade-in slide-in-from-bottom-1 motion-reduce:animate-none'
            >
              {selectedCount}
            </span>{' '}
            selected
          </p>
          {toolbarMessage ? (
            <p aria-live='polite' className='text-sm text-destructive'>
              {toolbarMessage}
            </p>
          ) : null}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' variant='outline' size='sm' onClick={onClear}>
            Clear
          </Button>
          <Button
            ref={deleteButtonRef}
            type='button'
            variant='destructive'
            size='sm'
            disabled={deleteDisabled}
            onClick={onDelete}
          >
            Delete selected
          </Button>
        </div>
      </div>
    </fieldset>
  );
}

function PlansGrid({
  page,
  deletablePlans,
  selectedPlanIds,
  onSelectionChange,
  onSelectAll,
  onDeselectAll,
  successFocusRef,
}: {
  page: PlanListPage;
  deletablePlans: PlanListItem[];
  selectedPlanIds: Set<string>;
  onSelectionChange: (planId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  successFocusRef: RefObject<HTMLElement | null>;
}) {
  const selectedCount = deletablePlans.filter((plan) =>
    selectedPlanIds.has(plan.id),
  ).length;
  const allSelected =
    deletablePlans.length > 0 && selectedCount === deletablePlans.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <label className='inline-flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground'>
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
            className='size-[20px] shrink-0 rounded-[4px] border border-border accent-action-primary outline-none focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:accent-disabled disabled:opacity-100'
          />
          Select all on page
        </label>
        <p className='text-xs text-muted-foreground'>
          {page.totalItems} {page.totalItems === 1 ? 'plan' : 'plans'}
        </p>
      </div>
      <ul
        aria-label='Learning plans'
        className='grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'
      >
        {page.items.map((plan, index) => (
          <PlanRow
            key={plan.id}
            plan={plan}
            index={index}
            referenceTimestamp={page.referenceTimestamp}
            selected={selectedPlanIds.has(plan.id)}
            selectable={isPlanBulkDeletable(plan)}
            onSelectionChange={onSelectionChange}
            successFocusRef={successFocusRef}
          />
        ))}
      </ul>
    </div>
  );
}

export function PlansList({ page, query }: PlansListProps) {
  const router = useRouter();
  const [isReconciliationPending, startReconciliation] = useTransition();
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [toolbarMessage, setToolbarMessage] = useState<string | null>(null);
  const bulkDeleteTriggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const handleBulkDeleteOutcomeUnknown = (): void => {
    handleClearSelection();
    startReconciliation(() => {
      router.refresh();
    });
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
    <div className='space-y-6'>
      <div className='flex flex-col gap-3'>
        <PlansStatusRail page={page} query={query} />
        <div className='flex w-full min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center'>
          <PlansSearch query={query} searchInputRef={searchInputRef} />
          <PlansSort query={query} />
        </div>
      </div>

      {selectedDeletablePlans.length > 0 ? (
        <BulkPlanActionsToolbar
          selectedCount={selectedDeletablePlans.length}
          toolbarMessage={toolbarMessage}
          deleteDisabled={isReconciliationPending}
          onClear={handleClearSelection}
          onDelete={() => {
            if (isReconciliationPending) return;
            setBulkDeleteOpen(true);
          }}
          deleteButtonRef={bulkDeleteTriggerRef}
        />
      ) : null}

      <BulkDeletePlansDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        plans={selectedDeletablePlans}
        onDeleted={handleBulkDeleted}
        onOutcomeUnknown={handleBulkDeleteOutcomeUnknown}
        returnFocusRef={bulkDeleteTriggerRef}
        successFocusRef={searchInputRef}
      />

      {page.items.length === 0 ? (
        <EmptyPlansList
          canCreatePlan={page.canCreatePlan}
          searchQuery={query.search}
          filterStatus={query.status}
        />
      ) : (
        <PlansGrid
          page={page}
          deletablePlans={deletablePlans}
          selectedPlanIds={selectedPlanIds}
          onSelectionChange={handleSelectionChange}
          onSelectAll={handleSelectAllOnPage}
          onDeselectAll={handleClearSelection}
          successFocusRef={searchInputRef}
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

      {page.items.length > 0 && page.canCreatePlan !== undefined ? (
        <PlansNextStep canCreatePlan={page.canCreatePlan} />
      ) : null}
    </div>
  );
}
