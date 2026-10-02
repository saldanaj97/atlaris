'use client';

import { PlanRouteErrorContent } from '@/app/(app)/plans/[id]/components/PlanRouteErrorContent';

interface ErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Route-level error boundary for module detail pages.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function ModuleDetailError({ error, retry }: ErrorProps) {
  return (
    <PlanRouteErrorContent
      error={error}
      retry={retry}
      logMessage='Module detail error:'
      title='Error loading module'
      message='Something went wrong while loading this module. This could be a temporary issue.'
    />
  );
}
