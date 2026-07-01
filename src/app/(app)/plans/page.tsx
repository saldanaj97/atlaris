import type {
  FilterStatus,
  PlanListQuery,
} from '@/features/plans/read-projection/types';
import type { Metadata } from 'next';

import {
  PlanCountBadgeContent,
  PlansContent,
} from '@/app/(app)/plans/components/PlansContent';
import { PlansContentSkeleton } from '@/app/(app)/plans/components/PlansContentSkeleton';
import { loadPlansPageData } from '@/app/(app)/plans/plans-page-data';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import Link from 'next/link';
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

  return {
    page:
      Number.isFinite(pageValue) && pageValue >= 1 ? Math.floor(pageValue) : 1,
    search: firstSearchParam(params?.search).trim(),
    status,
  };
}

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const query = await parsePlansQuery(searchParams);
  const plansPageData = loadPlansPageData(query);

  return (
    <>
      {/* Static header - renders immediately; count waits independently. */}
      <PageHeader
        title='Your Plans'
        subtitle='Search, filter, and compare your learning plan library.'
        actions={
          <div className='flex items-center gap-2 sm:pt-8'>
            <Suspense fallback={<Skeleton className='h-6 w-16 rounded-full' />}>
              <PlanCountBadgeContent dataPromise={plansPageData} />
            </Suspense>
            <Button asChild>
              <Link href='/plans/new'>
                <Plus />
                New Plan
              </Link>
            </Button>
          </div>
        }
      />

      {/* Data-dependent content (search, filters, list) - wrapped in Suspense */}
      <Suspense fallback={<PlansContentSkeleton />}>
        <PlansContent dataPromise={plansPageData} query={query} />
      </Suspense>
    </>
  );
}
