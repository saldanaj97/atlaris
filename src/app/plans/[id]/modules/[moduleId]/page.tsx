import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ModuleDetailPageError } from '@/app/plans/[id]/modules/[moduleId]/components/Error';
import {
  ModuleDetailContent,
  ModuleDetailContentSkeleton,
} from '@/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent';

interface ModulePageProps {
  params: Promise<{ id: string; moduleId: string }>;
}

export async function generateMetadata({
  params,
}: ModulePageProps): Promise<Metadata> {
  const { moduleId } = await params;

  return {
    title: `Module ${moduleId} | Atlaris`,
    description:
      'View module details, tasks, and resources for this learning plan module.',
  };
}

/**
 * Module detail page with Suspense boundary for data-dependent content.
 *
 * The page validates the route params and wraps all data-dependent content
 * (module details, error states) in a Suspense boundary.
 */
export default async function ModuleDetailPage({ params }: ModulePageProps) {
  const { id: planId, moduleId } = await params;

  if (!moduleId) {
    return <ModuleDetailPageError planId={planId} />;
  }

  return (
    <Suspense fallback={<ModuleDetailContentSkeleton />}>
      <ModuleDetailContent planId={planId} moduleId={moduleId} />
    </Suspense>
  );
}
