'use client';

import { PlanRouteErrorContent } from '@/app/(app)/plans/[id]/components/PlanRouteErrorContent';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for plan detail pages.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function PlanDetailError({ error, reset }: ErrorProps) {
  return (
    <PlanRouteErrorContent
      error={error}
      reset={reset}
      logMessage="Plan detail error:"
      title="Error Loading Plan"
      message="Something went wrong while loading this plan. This could be a temporary issue."
    />
  );
}
