'use client';

import type {
  FilterStatus,
  PlanListPage,
  PlanListQuery,
  PlanReadStatus,
} from '@/features/plans/read-projection/types';

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

function plansHref(params: {
  search: string;
  status: FilterStatus;
  page?: number;
}): string {
  const searchParams = new URLSearchParams();

  if (params.search) {
    searchParams.set('search', params.search);
  }
  if (params.status !== 'all') {
    searchParams.set('status', params.status);
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

function PlansControls({
  page,
  query,
}: {
  page: PlanListPage;
  query: PlanListQuery;
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
        <Input
          type='search'
          name='search'
          placeholder='Search plans...'
          aria-label='Search learning plans'
          className='h-11 border-border bg-background pl-9 dark:bg-input/30'
          defaultValue={query.search}
        />
      </form>

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
  return (
    <div className='space-y-5'>
      <PlansHero page={page} />
      <PlansControls page={page} query={query} />

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
