// Feature flags, evaluated in Cloudflare Flagship. The app evaluates over
// HTTP through the OpenFeature server provider with a short response cache;
// the jobs Worker registers its `FLAGS` binding with `setFlagEvaluator()`.
// Flag keys match the Flagship app; every flag is boolean and fails closed.
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { flagshipEnv } from '@/lib/config/env/flagship';

/** Attributes Flagship targeting rules can read. `environment` is always set. */
export type FlagContext = Readonly<Record<string, string>>;

/**
 * What a flag source must offer: the Flagship binding on the Worker and an
 * OpenFeature client on the app both have this method.
 */
export interface FlagEvaluator {
  getBooleanDetails(
    key: string,
    defaultValue: boolean,
    context?: FlagContext,
  ): Promise<{ readonly value: boolean; readonly errorCode?: string }>;
}

/** How long the app reuses an evaluation for the same flag and context. */
export const FLAG_CACHE_TTL_MS = 30_000;

/** Evaluation timeout for the HTTP provider (`AbortSignal.timeout` style). */
const FLAG_REQUEST_TIMEOUT_MS = 5_000;

export class FlagEvaluationError extends Error {
  constructor(
    readonly flagKey: string,
    readonly code: string,
  ) {
    super(`Flag "${flagKey}" could not be evaluated (${code}).`);
    this.name = 'FlagEvaluationError';
  }
}

let evaluator: FlagEvaluator | null = null;
let pendingEvaluator: Promise<FlagEvaluator> | null = null;

/**
 * Replaces the flag source. The jobs Worker passes its Flagship binding;
 * tests pass a fake; `null` returns to the app's HTTP provider.
 */
export function setFlagEvaluator(next: FlagEvaluator | null): void {
  evaluator = next;
  pendingEvaluator = null;
}

/** Builds the OpenFeature client once per process; a failed setup is retried on the next call. */
async function createHttpEvaluator(): Promise<FlagEvaluator> {
  const [{ OpenFeature }, { FlagshipServerProvider }] = await Promise.all([
    import('@openfeature/server-sdk'),
    import('@cloudflare/flagship/server'),
  ]);
  await OpenFeature.setProviderAndWait(
    new FlagshipServerProvider({
      appId: flagshipEnv.appId,
      accountId: flagshipEnv.accountId,
      authToken: flagshipEnv.apiToken,
      timeout: FLAG_REQUEST_TIMEOUT_MS,
      cacheTtl: FLAG_CACHE_TTL_MS,
    }),
  );
  return OpenFeature.getClient();
}

async function resolveEvaluator(): Promise<FlagEvaluator | null> {
  if (evaluator !== null) return evaluator;
  if (!flagshipEnv.isConfigured) return null;
  pendingEvaluator ??= createHttpEvaluator()
    .then((client) => {
      evaluator = client;
      return client;
    })
    .catch((error: unknown) => {
      pendingEvaluator = null;
      throw error;
    });
  return pendingEvaluator;
}

/**
 * Evaluates a boolean flag. Throws `FlagEvaluationError` when Flagship reports
 * an error (missing flag, type mismatch, network) or when a hosted deployment
 * has no provider configured, so callers can apply their own fail-safe.
 */
async function evaluateBoolean(
  key: string,
  defaultValue: boolean,
  context?: FlagContext,
): Promise<boolean> {
  const source = await resolveEvaluator();
  if (source === null) {
    if (flagshipEnv.isRequired) {
      throw new FlagEvaluationError(key, 'PROVIDER_NOT_CONFIGURED');
    }
    return defaultValue;
  }
  const details = await source.getBooleanDetails(key, defaultValue, {
    environment: flagshipEnv.environment,
    ...context,
  });
  if (details.errorCode) {
    throw new FlagEvaluationError(key, details.errorCode);
  }
  return details.value;
}

/** Route all app traffic to the maintenance page. */
export const maintenanceMode = (): Promise<boolean> =>
  evaluateBoolean('maintenance-mode', false);

/** Pre-launch gate: marketing pages stay live, app and auth routes go to /waitlist. */
export const launchWaitlist = (): Promise<boolean> =>
  evaluateBoolean('launch-waitlist', false);

/** Allow the jobs Worker to send opted-in email notifications. */
export const emailNotificationDelivery = (): Promise<boolean> =>
  evaluateBoolean('email-notification-delivery', false);

/** Allow synchronous and workflow-backed module lesson generation. */
export const moduleLessonGeneration = (): Promise<boolean> =>
  evaluateBoolean('module-lesson-generation', false);

/**
 * Whether `tier` runs the grounded generation pipeline (research, verify,
 * advisor). Targeting rules on the `subscriptionTier` attribute choose the
 * tiers; the flag's default variation applies to the rest.
 */
export const groundedGeneration = (tier: SubscriptionTier): Promise<boolean> =>
  evaluateBoolean('grounded-generation', false, { subscriptionTier: tier });
