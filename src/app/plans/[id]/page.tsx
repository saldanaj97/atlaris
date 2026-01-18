import { Suspense } from 'react';

import { PlanDetailPageError } from '@/app/plans/[id]/components/Error';
import {
  PlanDetailContent,
  PlanDetailContentSkeleton,
} from '@/app/plans/[id]/components/PlanDetailContent';

interface PlanPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Plan detail page with Suspense boundary for data-dependent content.
 *
 * The page validates the route param and wraps data-dependent content
 * in a Suspense boundary for loading states. Runtime errors are handled
 * by the route-level error.tsx boundary.
 */
export default async function PlanDetailPage({ params }: PlanPageProps) {
  const { id } = await params;
  if (!id) return <PlanDetailPageError />;

  return (
    <div className="mx-auto min-h-screen max-w-7xl py-8">
      {/* Data-dependent content - wrapped in Suspense */}
      <Suspense fallback={<PlanDetailContentSkeleton />}>
        <PlanDetailContent planId={id} />
      </Suspense>
    </div>
  );
}
