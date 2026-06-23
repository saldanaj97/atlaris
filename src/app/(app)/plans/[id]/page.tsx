import type { Metadata } from 'next';

import { PlanDetailPageError } from '@/app/(app)/plans/[id]/components/Error';
import {
  PlanDetailContent,
  PlanDetailContentSkeleton,
} from '@/app/(app)/plans/[id]/components/PlanDetailContent';
import { Suspense } from 'react';

interface PlanPageProps {
  params: Promise<{ id: string }>;
}

const PLAN_METADATA_TITLE =
  'Atlaris — Turn learning goals into a scheduled plan';
const PLAN_METADATA_DESCRIPTION =
  'Generate a time-blocked study plan from any goal with modules, resources, and progress tracking.';

export function generateMetadata({ params: _params }: PlanPageProps): Metadata {
  return {
    title: PLAN_METADATA_TITLE,
    description: PLAN_METADATA_DESCRIPTION,
    openGraph: {
      title: PLAN_METADATA_TITLE,
      description: PLAN_METADATA_DESCRIPTION,
      type: 'website',
    },
  };
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
    <Suspense fallback={<PlanDetailContentSkeleton />}>
      <PlanDetailContent planId={id} />
    </Suspense>
  );
}
