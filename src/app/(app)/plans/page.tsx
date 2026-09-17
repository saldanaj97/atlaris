import type {
  PlanListQuery,
  PlanListSort,
} from '@/features/plans/read-projection/types';
import type { Metadata } from 'next';

import {
  PlansContent,
  PlansHeaderCreateAction,
  PlansLibraryChrome,
} from '@/app/(app)/plans/components/PlansContent';
import {
  PlansChromeSkeleton,
  PlansContentSkeleton,
} from '@/app/(app)/plans/components/PlansContentSkeleton';
import { PlansHero } from '@/app/(app)/plans/components/PlansHero';
import { resolvePlansLibraryFilterStatus } from '@/app/(app)/plans/plans-library-filter';
import { loadPlansPageData } from '@/app/(app)/plans/plans-page-data';
import { Skeleton } from '@/components/ui/skeleton';
import { PLAN_LIST_SORTS } from '@/features/plans/read-projection/types';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';
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
    images: [OG_DEFAULT_IMAGE],
  },
};

type PlansPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PLAN_SORTS = new Set<PlanListSort>(PLAN_LIST_SORTS);

function firstSearchParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

async function parsePlansQuery(
  searchParams: PlansPageProps['searchParams'],
): Promise<PlanListQuery> {
  const params = await searchParams;
  const pageValue = Number(firstSearchParam(params?.page));
  const status = resolvePlansLibraryFilterStatus(
    firstSearchParam(params?.status),
  );
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
      <PlansHero
        chrome={
          <Suspense fallback={<PlansChromeSkeleton />}>
            <PlansLibraryChrome dataPromise={plansPageData} query={query} />
          </Suspense>
        }
      >
        <Suspense fallback={<Skeleton className='h-10 w-28' />}>
          <PlansHeaderCreateAction dataPromise={plansPageData} />
        </Suspense>
      </PlansHero>

      <Suspense fallback={<PlansContentSkeleton />}>
        <PlansContent dataPromise={plansPageData} query={query} />
      </Suspense>
    </>
  );
}
