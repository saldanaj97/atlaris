import type {
  FilterStatus,
  PlanListQuery,
  PlanListSort,
} from '@/features/plans/read-projection/types';
import type { Metadata } from 'next';

import {
  PlanHeaderSummaryContent,
  PlansContent,
  PlansHeaderCreateAction,
} from '@/app/(app)/plans/components/PlansContent';
import { PlansContentSkeleton } from '@/app/(app)/plans/components/PlansContentSkeleton';
import { loadPlansPageData } from '@/app/(app)/plans/plans-page-data';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { PLAN_LIST_SORTS } from '@/features/plans/read-projection/types';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Your Plans | Atlaris',
  description:
    'View, search, and manage your learning plans and track your progress in Atlaris.',
  openGraph: {
    title: 'Your Plans | Atlaris',
    description:
      'View, search, and manage your learning plans and track your progress in Atlaris.',
    url: '/plans',
    images: ['/og-default.jpg'],
  },
};

type PlansPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PLAN_FILTERS = new Set<FilterStatus>([
  'all',
  'not_started',
  'active',
  'completed',
  'generating',
  'failed',
  'inactive',
]);

const PLAN_SORTS = new Set<PlanListSort>(PLAN_LIST_SORTS);

function firstSearchParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

async function parsePlansQuery(
  searchParams: PlansPageProps['searchParams'],
): Promise<PlanListQuery> {
  const params = await searchParams;
  const pageValue = Number(firstSearchParam(params?.page));
  const statusValue = firstSearchParam(params?.status);
  const canonicalStatusValue =
    statusValue === 'paused' ? 'inactive' : statusValue;
  const status = PLAN_FILTERS.has(canonicalStatusValue as FilterStatus)
    ? (canonicalStatusValue as FilterStatus)
    : 'all';
  const sortValue = firstSearchParam(params?.sort);
  const sort = PLAN_SORTS.has(sortValue as PlanListSort)
    ? (sortValue as PlanListSort)
    : 'recommended';

  return {
    page:
      Number.isFinite(pageValue) && pageValue >= 1 ? Math.floor(pageValue) : 1,
    search: firstSearchParam(params?.search).trim(),
    status,
    sort,
  };
}

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const query = await parsePlansQuery(searchParams);
  const plansPageData = loadPlansPageData(query);

  return (
    <>
      {/* Static header - renders immediately; usage summary streams in independently. */}
      <PageHeader
        title='Your Plans'
        subtitle='Search, sort, and track your learning plan library.'
        actions={
          <>
            <Suspense
              fallback={
                <div className='flex items-center gap-3'>
                  <Skeleton className='h-4 w-32' />
                  <Skeleton className='h-6 w-24 rounded-full' />
                </div>
              }
            >
              <PlanHeaderSummaryContent dataPromise={plansPageData} />
            </Suspense>
            <Suspense fallback={<Skeleton className='h-9 w-28' />}>
              <PlansHeaderCreateAction dataPromise={plansPageData} />
            </Suspense>
          </>
        }
      />

      {/* Data-dependent content (search and table) - wrapped in Suspense */}
      <Suspense fallback={<PlansContentSkeleton />}>
        <PlansContent dataPromise={plansPageData} query={query} />
      </Suspense>
    </>
  );
}
