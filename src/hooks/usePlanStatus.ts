'use client';

import type { PlanStatus } from '@/shared/types/client.types';

import { PlanStatusPoller } from '@/features/plans/status-polling/plan-status-poller';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

interface UsePlanStatusReturn {
  status: PlanStatus;
  attempts: number;
  error: string | null;
  pollingError: string | null;
  isPolling: boolean;
  revalidate: () => Promise<void>;
}

function createPoller(
  planId: string,
  initialStatus: PlanStatus,
  fetcher: typeof fetch,
): PlanStatusPoller {
  return new PlanStatusPoller({ planId, initialStatus, fetcher });
}

export function usePlanStatus(
  planId: string,
  initialStatus: PlanStatus,
  fetcher: typeof fetch = fetch,
): UsePlanStatusReturn {
  const initialStatusRef = useRef(initialStatus);
  initialStatusRef.current = initialStatus;

  const [poller, setPoller] = useState(() =>
    createPoller(planId, initialStatus, fetcher),
  );
  const pollerRef = useRef(poller);
  pollerRef.current = poller;

  const planIdRef = useRef(planId);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    const planIdChanged = planIdRef.current !== planId;
    const fetcherChanged = fetcherRef.current !== fetcher;
    planIdRef.current = planId;
    fetcherRef.current = fetcher;

    if (planIdChanged || fetcherChanged) {
      pollerRef.current.dispose();
      const nextPoller = createPoller(
        planId,
        initialStatusRef.current,
        fetcher,
      );
      pollerRef.current = nextPoller;
      setPoller(nextPoller);
    }
  }, [planId, fetcher]);

  const snapshot = useSyncExternalStore(
    poller.subscribe,
    poller.getSnapshot,
    poller.getSnapshot,
  );

  useEffect(() => {
    poller.start();
    return () => {
      poller.dispose();
    };
  }, [poller]);

  return {
    status: snapshot.status,
    attempts: snapshot.attempts,
    error: snapshot.error,
    pollingError: snapshot.pollingError,
    isPolling: snapshot.isPolling,
    revalidate: poller.revalidate,
  };
}
