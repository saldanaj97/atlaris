'use client';

import { RouteErrorState } from '@/components/ui/route-error-state';
import { useRouter } from 'next/navigation';

/** Shown when the billing snapshot can't be read; retry re-runs the server read. */
export function BillingUnavailable({
  subject,
}: {
  subject: 'billing' | 'usage';
}) {
  const router = useRouter();

  return (
    <RouteErrorState
      title={`${subject === 'billing' ? 'Billing' : 'Usage'} unavailable`}
      message={`We couldn't load your ${subject} details. This could be a temporary issue.`}
      onRetry={() => router.refresh()}
    />
  );
}
