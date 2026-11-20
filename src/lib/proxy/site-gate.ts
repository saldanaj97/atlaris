import type { SiteGate } from '@/lib/proxy/middleware-policy';

import { launchWaitlist, maintenanceMode } from '@/flags';
import { appEnv } from '@/lib/config/env';
import * as Sentry from '@sentry/nextjs';

export const SITE_GATE_CACHE_TTL_MS = 60_000;

export const SITE_GATE_FALLBACK_CACHE_TTL_MS = 10_000;

let cachedSiteGate: { gate: SiteGate | null; expiresAt: number } | null = null;
let pendingSiteGate: Promise<SiteGate | null> | null = null;

export function resetSiteGateCacheForTests(): void {
  cachedSiteGate = null;
  pendingSiteGate = null;
}

async function resolveGateFlag(
  feature: 'maintenance_flag' | 'launch_waitlist_flag',
  resolveFlag: () => Promise<boolean>,
  envFailSafe: boolean,
): Promise<{ value: boolean; usedFallback: boolean }> {
  try {
    return { value: await resolveFlag(), usedFallback: false };
  } catch (error: unknown) {
    const outcome = envFailSafe ? 'fail_closed' : 'fail_open';
    const detail = envFailSafe
      ? `${feature} evaluation failed; failing closed (env fail-safe is on).`
      : `${feature} evaluation failed; failing open.`;
    console.warn(`[atlaris] ${detail}`, error);
    Sentry.withScope((scope) => {
      scope.setTag('feature', feature);
      scope.setTag('outcome', outcome);
      scope.setExtra('detail', detail);
      const err = error instanceof Error ? error : new Error(String(error));
      Sentry.captureException(err);
    });
    return { value: envFailSafe, usedFallback: true };
  }
}

async function evaluateSiteGate(): Promise<{
  gate: SiteGate | null;
  ttlMs: number;
}> {
  const [maintenance, waitlist] = await Promise.all([
    resolveGateFlag(
      'maintenance_flag',
      maintenanceMode,
      appEnv.maintenanceMode,
    ),
    resolveGateFlag(
      'launch_waitlist_flag',
      launchWaitlist,
      appEnv.launchWaitlist,
    ),
  ]);
  let gate: SiteGate | null = null;
  if (maintenance.value) gate = 'maintenance';
  else if (waitlist.value) gate = 'waitlist';

  const clean =
    !maintenance.usedFallback && (maintenance.value || !waitlist.usedFallback);
  return {
    gate,
    ttlMs: clean ? SITE_GATE_CACHE_TTL_MS : SITE_GATE_FALLBACK_CACHE_TTL_MS,
  };
}

export async function resolveSiteGate(): Promise<SiteGate | null> {
  if (cachedSiteGate !== null && Date.now() < cachedSiteGate.expiresAt) {
    return cachedSiteGate.gate;
  }
  pendingSiteGate ??= evaluateSiteGate()
    .then(({ gate, ttlMs }) => {
      cachedSiteGate = { gate, expiresAt: Date.now() + ttlMs };
      return gate;
    })
    .finally(() => {
      pendingSiteGate = null;
    });
  return pendingSiteGate;
}
