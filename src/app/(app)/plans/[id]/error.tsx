'use client';

import { PlanRouteErrorContent } from '@/app/(app)/plans/[id]/components/PlanRouteErrorContent';

interface ErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Route-level error boundary for plan detail pages.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function PlanDetailError({ error, retry }: ErrorProps) {
  return (
    <PlanRouteErrorContent
      error={error}
      retry={retry}
      logMessage='Plan detail error:'
      title='Error loading plan'
      message='Something went wrong while loading this plan. This could be a temporary issue.'
    />
  );
}
