'use client';

import { SettingsErrorContent } from '@/app/(app)/settings/components/SettingsErrorContent';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for billing settings page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function BillingError({ error, reset }: ErrorProps) {
  return (
    <SettingsErrorContent
      error={error}
      reset={reset}
      logMessage="Billing page error:"
      title="Billing"
      errorTitle="Error Loading Billing Information"
      errorMessage="We couldn't load your billing information. This could be a temporary issue."
    />
  );
}
