'use client';

import { syncAnalyticsTimezoneAction } from './actions';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * React component that synchronizes the user's analytics timezone preference
 * with their current browser timezone if they differ. This runs as a side-effect
 * when mounted and performs a best-effort update by calling an action,
 * then refreshes the router if the timezone is updated.
 */
export function UsageAnalyticsTimezoneSync({
  analyticsTimezone,
}: {
  analyticsTimezone: string;
}) {
  const router = useRouter();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTimezone || browserTimezone === analyticsTimezone) return;

    void syncAnalyticsTimezoneAction(browserTimezone)
      .then((updated) => {
        if (updated) router.refresh();
      })
      .catch(() => {
        // Best-effort preference sync; analytics still render with the stored timezone.
      });
  }, [analyticsTimezone, router]);

  return null;
}
