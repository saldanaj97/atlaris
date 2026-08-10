'use client';

import {
  CHECKOUT_BASELINE_QUERY_PARAM,
  CHECKOUT_RETURN_QUERY_PARAM,
  CHECKOUT_SYNC_POLL_INTERVAL_MS,
  CHECKOUT_SYNC_TIMEOUT_MESSAGE,
  CHECKOUT_SYNC_TIMEOUT_MS,
  CHECKOUT_SYNC_UPDATING_MESSAGE,
  buildCheckoutBillingSignature,
  hasCheckoutBillingCaughtUp,
  isCheckoutReturnQueryValue,
  shouldContinueCheckoutSync,
} from '@/features/billing/checkout-return';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type CheckoutSubscriptionSyncProps = {
  pollIntervalMs?: number;
  timeoutMs?: number;
};

type SyncPhase = 'idle' | 'updating' | 'timeout';

async function fetchCheckoutBillingSignature(
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch('/api/v1/user/subscription', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    tier?: string;
    status?: string | null;
    periodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
  };

  if (!payload.tier) {
    return null;
  }

  return buildCheckoutBillingSignature({
    tier: payload.tier,
    status: payload.status ?? null,
    periodEnd: payload.periodEnd ?? null,
    cancelAtPeriodEnd: Boolean(payload.cancelAtPeriodEnd),
  });
}

function clearCheckoutReturnQuery(router: ReturnType<typeof useRouter>): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(CHECKOUT_RETURN_QUERY_PARAM)) {
    return;
  }

  url.searchParams.delete(CHECKOUT_RETURN_QUERY_PARAM);
  url.searchParams.delete(CHECKOUT_BASELINE_QUERY_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  router.replace(next);
}

/**
 * Bounded post-checkout sync for Atlaris DB projection lag after Clerk redirects
 * to settings. Only activates for the explicit `?checkout=1` return marker.
 */
export function CheckoutSubscriptionSync({
  pollIntervalMs = CHECKOUT_SYNC_POLL_INTERVAL_MS,
  timeoutMs = CHECKOUT_SYNC_TIMEOUT_MS,
}: CheckoutSubscriptionSyncProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutReturn = isCheckoutReturnQueryValue(
    searchParams.get(CHECKOUT_RETURN_QUERY_PARAM),
  );
  const baselineSignature = searchParams.get(CHECKOUT_BASELINE_QUERY_PARAM);
  const shouldSync = checkoutReturn && Boolean(baselineSignature);
  const [phase, setPhase] = useState<SyncPhase>(
    shouldSync ? 'updating' : 'idle',
  );

  useEffect(() => {
    if (!shouldSync || !baselineSignature) {
      return;
    }

    const startedAt = Date.now();
    let settled = false;
    let activeController: AbortController | undefined;
    let deadlineTimeoutId: ReturnType<typeof setTimeout>;
    let pollIntervalId: ReturnType<typeof setInterval>;

    const stopTimers = () => {
      clearTimeout(deadlineTimeoutId);
      clearInterval(pollIntervalId);
    };

    const finishCaughtUp = () => {
      if (settled) return;
      settled = true;
      stopTimers();
      setPhase('idle');
      clearCheckoutReturnQuery(router);
      router.refresh();
    };

    const finishTimeout = () => {
      if (settled) return;
      settled = true;
      stopTimers();
      activeController?.abort();
      setPhase('timeout');
      clearCheckoutReturnQuery(router);
    };

    const poll = async () => {
      if (settled || activeController) return;

      const elapsedMs = Date.now() - startedAt;
      if (
        !shouldContinueCheckoutSync({
          elapsedMs,
          timeoutMs,
          caughtUp: false,
        })
      ) {
        finishTimeout();
        return;
      }

      const controller = new AbortController();
      activeController = controller;
      let currentSignature: string | null = null;
      try {
        currentSignature = await fetchCheckoutBillingSignature(
          controller.signal,
        );
      } catch {
        // Keep polling until the bounded timeout; webhook lag can coincide with transient errors.
      }
      if (activeController === controller) {
        activeController = undefined;
      }

      if (settled) return;

      if (
        currentSignature &&
        hasCheckoutBillingCaughtUp({
          baselineSignature,
          currentSignature,
        })
      ) {
        finishCaughtUp();
        return;
      }

      const nextElapsedMs = Date.now() - startedAt;
      if (
        !shouldContinueCheckoutSync({
          elapsedMs: nextElapsedMs,
          timeoutMs,
          caughtUp: false,
        })
      ) {
        finishTimeout();
        return;
      }
    };

    deadlineTimeoutId = setTimeout(finishTimeout, timeoutMs);
    pollIntervalId = setInterval(() => void poll(), pollIntervalMs);
    void poll();

    return () => {
      settled = true;
      stopTimers();
      activeController?.abort();
    };
  }, [baselineSignature, pollIntervalMs, router, shouldSync, timeoutMs]);

  if (phase === 'idle') {
    return null;
  }

  return (
    <div
      className='mb-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground'
      role='status'
      aria-live='polite'
    >
      {phase === 'updating'
        ? CHECKOUT_SYNC_UPDATING_MESSAGE
        : CHECKOUT_SYNC_TIMEOUT_MESSAGE}
    </div>
  );
}
