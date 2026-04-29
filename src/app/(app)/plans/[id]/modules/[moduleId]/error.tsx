'use client';

import { PlanRouteErrorContent } from '@/app/(app)/plans/[id]/components/PlanRouteErrorContent';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for module detail pages.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function ModuleDetailError({ error, reset }: ErrorProps) {
  return (
    <PlanRouteErrorContent
      error={error}
      reset={reset}
      logMessage="Module detail error:"
      title="Error Loading Module"
      message="Something went wrong while loading this module. This could be a temporary issue."
    />
  );
}
