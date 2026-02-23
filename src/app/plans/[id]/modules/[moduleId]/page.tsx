import type { Metadata } from 'next';
import type { JSX } from 'react';
import { Suspense } from 'react';

import { ModuleDetailPageError } from '@/app/plans/[id]/modules/[moduleId]/components/Error';
import {
  ModuleDetailContent,
  ModuleDetailContentSkeleton,
} from '@/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent';

interface ModulePageProps {
  params: { id: string; moduleId: string };
}

const MODULE_METADATA_DESCRIPTION =
  'View module details, tasks, and resources for this learning plan module.';

export function generateMetadata({ params }: ModulePageProps): Metadata {
  void params;

  return {
    title: 'Module Details | Atlaris',
    description: MODULE_METADATA_DESCRIPTION,
  };
}

/**
 * Module detail page with Suspense boundary for data-dependent content.
 *
 * The page validates the route params and wraps all data-dependent content
 * (module details, error states) in a Suspense boundary.
 */
export default function ModuleDetailPage({
  params,
}: ModulePageProps): JSX.Element {
  const { id: planId, moduleId } = params;

  if (!moduleId) {
    return <ModuleDetailPageError planId={planId} />;
  }

  return (
    <Suspense fallback={<ModuleDetailContentSkeleton />}>
      <ModuleDetailContent planId={planId} moduleId={moduleId} />
    </Suspense>
  );
}
