import type { SiteGate } from '@/lib/proxy/middleware-policy';

import { launchWaitlist, maintenanceMode } from '@/flags';
import { appEnv } from '@/lib/config/env';
import * as Sentry from '@sentry/nextjs';

/** How long one process reuses a gate read cleanly from Vercel Flags. */
export const SITE_GATE_CACHE_TTL_MS = 60_000;

/** Shorter reuse for a gate built from an env fail-safe: bounds flag reads and Sentry events during an outage. */
export const SITE_GATE_FALLBACK_CACHE_TTL_MS = 10_000;

/**
 * Flags SDK override cookie (production QA). `flags/next` resolves overrides per
 * request, so a shared cached gate would ignore or leak them; callers bypass the cache.
 */
export const FLAG_OVERRIDES_COOKIE = 'vercel-flag-overrides';

let cachedSiteGate: { gate: SiteGate | null; expiresAt: number } | null = null;
let pendingSiteGate: Promise<SiteGate | null> | null = null;

export function resetSiteGateCacheForTests(): void {
  cachedSiteGate = null;
  pendingSiteGate = null;
}

/** Evaluates a gate flag. If evaluation throws, uses the env fail-safe and reports the outage. */
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

/** Maintenance wins over the launch waitlist. */
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

  // A clean maintenance read decides the gate alone, so a waitlist fallback cannot change it.
  const clean =
    !maintenance.usedFallback && (maintenance.value || !waitlist.usedFallback);
  return {
    gate,
    ttlMs: clean ? SITE_GATE_CACHE_TTL_MS : SITE_GATE_FALLBACK_CACHE_TTL_MS,
  };
}

/**
 * Active site gate from Vercel Flags, cached per process: SITE_GATE_CACHE_TTL_MS for a
 * clean read, SITE_GATE_FALLBACK_CACHE_TTL_MS for an env fail-safe. `bypassCache`
 * neither reads nor writes the cache (flag-override requests).
 */
export async function resolveSiteGate(options: {
  bypassCache: boolean;
}): Promise<SiteGate | null> {
  if (options.bypassCache) {
    return (await evaluateSiteGate()).gate;
  }
  if (cachedSiteGate !== null && Date.now() < cachedSiteGate.expiresAt) {
    return cachedSiteGate.gate;
  }
  // Concurrent misses share one evaluation, so a slower, older read cannot overwrite a newer one.
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
