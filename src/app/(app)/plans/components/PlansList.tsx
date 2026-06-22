'use client';

import type { UsageData } from '@/app/_shared/usage-formatting';
import type {
  FilterStatus,
  PlanListPage,
  PlanListQuery,
  PlanReadStatus,
} from '@/features/plans/read-projection/types';

import { EmptyPlansList } from '@/app/(app)/plans/components/EmptyPlansList';
import { PlanRow } from '@/app/(app)/plans/components/PlanRow';
import { getPlanStatusDotClassName } from '@/app/(app)/plans/plan-status-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';

interface PlansListProps {
  page: PlanListPage;
  query: PlanListQuery;
  usage?: UsageData;
}

const FILTER_TABS: {
  id: FilterStatus;
  label: string;
  status?: PlanReadStatus;
}[] = [
  { id: 'all', label: 'All' },
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

export function PlansList({ page, query, usage: _usage }: PlansListProps) {
  return (
    <>
      <form action='/plans' className='relative mb-6'>
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
          placeholder='Search plans…'
          aria-label='Search learning plans'
          className='h-11 border-border bg-muted/50 pl-9 dark:bg-muted/30'
          defaultValue={query.search}
        />
      </form>

      <div className='mb-6 flex items-center gap-2 border-b border-border pb-4'>
        <Tabs value={query.status}>
          <TabsList className='h-auto flex-wrap gap-1 bg-transparent p-0'>
            {FILTER_TABS.map((tab) => {
              const count = getFilterCount(tab, page);
              return (
                <TabsTrigger
                  asChild
                  key={tab.id}
                  value={tab.id}
                  className='rounded-lg px-3 py-1.5'
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
      </div>

      <div>
        {page.items.length === 0 ? (
          <EmptyPlansList
            searchQuery={query.search}
            filterStatus={query.status}
          />
        ) : (
          <div className='space-y-2'>
            {page.items.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                referenceTimestamp={page.referenceTimestamp}
              />
            ))}
          </div>
        )}
      </div>

      {page.totalPages > 1 ? (
        <nav
          aria-label='Plans pagination'
          className='mt-6 flex items-center justify-between gap-4 text-sm text-muted-foreground'
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
    </>
  );
}
