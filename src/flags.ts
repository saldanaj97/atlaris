// Feature flags, evaluated in Cloudflare Flagship. The app evaluates over
// HTTP through the OpenFeature server provider with a short response cache;
// the jobs Worker registers its `FLAGS` binding with `setFlagEvaluator()`.
// Flag keys match the Flagship app; every flag is boolean and fails closed,
// except `jobs-paused` and `regeneration-paused`, whose callers treat a failed
// read as "not paused".
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { flagshipEnv } from '@/lib/config/env/flagship';
import { logger } from '@/lib/logging/logger';

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

export const FLAG_CACHE_TTL_MS = 30_000;

export const FLAG_FAILURE_TTL_MS = 30_000;

const FLAG_REQUEST_TIMEOUT_MS = 5_000;

export class FlagEvaluationError extends Error {
  constructor(
    readonly flagKey: string,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(`Flag "${flagKey}" could not be evaluated (${code}).`, options);
    this.name = 'FlagEvaluationError';
  }
}

let evaluator: FlagEvaluator | null = null;
let pendingEvaluator: Promise<FlagEvaluator> | null = null;
const failures = new Map<
  string,
  { readonly error: FlagEvaluationError; readonly expiresAt: number }
>();

/**
 * Replaces the flag source. The jobs Worker passes its Flagship binding;
 * tests pass a fake; `null` returns to the app's HTTP provider.
 */
export function setFlagEvaluator(next: FlagEvaluator | null): void {
  evaluator = next;
  pendingEvaluator = null;
  failures.clear();
}

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

function failureKey(key: string, context: FlagContext): string {
  const attributes = Object.keys(context)
    .sort()
    .map((name) => `${name}=${context[name]}`)
    .join('&');
  return `${key}?${attributes}`;
}

function recordFailure(
  key: string,
  context: FlagContext,
  error: FlagEvaluationError,
): FlagEvaluationError {
  failures.set(failureKey(key, context), {
    error,
    expiresAt: Date.now() + FLAG_FAILURE_TTL_MS,
  });
  logger.warn(
    { flagKey: key, context, code: error.code, err: error.cause ?? error },
    `Flag evaluation failed; callers apply their fallback for ${FLAG_FAILURE_TTL_MS / 1000} s`,
  );
  return error;
}

async function evaluateBoolean(
  key: string,
  defaultValue: boolean,
  context?: FlagContext,
): Promise<boolean> {
  const fullContext: FlagContext = {
    environment: flagshipEnv.environment,
    ...context,
  };
  const remembered = failures.get(failureKey(key, fullContext));
  if (remembered !== undefined && remembered.expiresAt > Date.now()) {
    throw remembered.error;
  }

  let source: FlagEvaluator | null;
  try {
    source = await resolveEvaluator();
  } catch (error) {
    throw recordFailure(
      key,
      fullContext,
      new FlagEvaluationError(key, 'PROVIDER_SETUP_FAILED', { cause: error }),
    );
  }
  if (source === null) {
    if (flagshipEnv.isRequired) {
      // A hosted deploy without the FLAGSHIP_* variables is an outage too:
      // remembered and logged like any other failure.
      throw recordFailure(
        key,
        fullContext,
        new FlagEvaluationError(key, 'PROVIDER_NOT_CONFIGURED'),
      );
    }
    return defaultValue;
  }

  let details: Awaited<ReturnType<FlagEvaluator['getBooleanDetails']>>;
  try {
    details = await source.getBooleanDetails(key, defaultValue, fullContext);
  } catch (error) {
    throw recordFailure(
      key,
      fullContext,
      new FlagEvaluationError(key, 'EVALUATION_FAILED', { cause: error }),
    );
  }
  if (details.errorCode) {
    throw recordFailure(
      key,
      fullContext,
      new FlagEvaluationError(key, details.errorCode),
    );
  }
  return details.value;
}

export const maintenanceMode = (): Promise<boolean> =>
  evaluateBoolean('maintenance-mode', false);

export const launchWaitlist = (): Promise<boolean> =>
  evaluateBoolean('launch-waitlist', false);

/**
 * Allow the app's manual email route to start a delivery run. The jobs Worker
 * does not read it; stopping Worker email takes `jobs-paused`.
 */
export const emailNotificationDelivery = (): Promise<boolean> =>
  evaluateBoolean('email-notification-delivery', false);

export const aboutPage = (): Promise<boolean> =>
  evaluateBoolean('about-page', false);

export const moduleLessonGeneration = (): Promise<boolean> =>
  evaluateBoolean('module-lesson-generation', false);

export const jobsPaused = (): Promise<boolean> =>
  evaluateBoolean('jobs-paused', false);

export const regenerationPaused = (): Promise<boolean> =>
  evaluateBoolean('regeneration-paused', false);

export const parallelDirectResearch = (): Promise<boolean> =>
  evaluateBoolean('parallel-direct-research', false);

export const jobRetentionCleanup = (): Promise<boolean> =>
  evaluateBoolean('job-retention-cleanup', true);

/**
 * Whether `tier` runs the grounded generation pipeline (research, verify,
 * advisor). Targeting rules on the `subscriptionTier` attribute choose the
 * tiers; the flag's default variation applies to the rest.
 */
export const groundedGeneration = (tier: SubscriptionTier): Promise<boolean> =>
  evaluateBoolean('grounded-generation', false, { subscriptionTier: tier });
