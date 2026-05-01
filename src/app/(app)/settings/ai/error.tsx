'use client';

import type { JSX } from 'react';
import { SettingsErrorContent } from '@/app/(app)/settings/components/SettingsErrorContent';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for AI settings page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function AISettingsError({
  error,
  reset,
}: ErrorProps): JSX.Element {
  return (
    <SettingsErrorContent
      error={error}
      reset={reset}
      logMessage="AI settings error:"
      title="AI Preferences"
      subtitle="Choose your preferred AI model for generating learning plans."
      errorTitle="Error Loading AI Settings"
      errorMessage="We couldn't load your AI preferences. This could be a temporary issue."
    />
  );
}
