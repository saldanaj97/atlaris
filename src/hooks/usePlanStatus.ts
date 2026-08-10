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
  const didMountRef = useRef(false);
  const [poller, setPoller] = useState(() =>
    createPoller(planId, initialStatus, fetcher),
  );

  useEffect(() => {
    initialStatusRef.current = initialStatus;
  }, [initialStatus]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    setPoller((currentPoller) => {
      currentPoller.dispose();
      return createPoller(planId, initialStatusRef.current, fetcher);
    });
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
