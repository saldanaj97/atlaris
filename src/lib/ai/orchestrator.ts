import { appEnv } from '@/lib/config/env';
import {
  finalizeAttemptFailure,
  finalizeAttemptSuccess,
  reserveAttemptSlot,
  type AttemptReservation,
  type AttemptsDbClient,
  type GenerationAttemptRecord,
} from '@/lib/db/queries/attempts';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/lib/types/client';
import * as Sentry from '@sentry/nextjs';

import { classifyFailure } from './classification';
import { pacePlan } from './pacing';
import {
  parseGenerationStream,
  type ParsedGeneration,
  type ParsedModule,
} from './parser';
import {
  ProviderMetadata,
  ProviderTimeoutError,
  type AiPlanGenerationProvider,
  type GenerationInput,
} from './provider';
import { getGenerationProvider } from './provider-factory';
import { createAdaptiveTimeout, type AdaptiveTimeoutConfig } from './timeout';

// Helper to safely attach an abort listener across environments where
// AbortSignal may not implement addEventListener (e.g., some jsdom/polyfills).
function attachAbortListener(
  signal: AbortSignal,
  listener: () => void
): () => void {
  if (signal.aborted) {
    listener();
    return () => {};
  }

  // Preferred path: EventTarget-style listeners
  if (
    'addEventListener' in signal &&
    typeof signal.addEventListener === 'function'
  ) {
    const handler = (_ev: Event) => listener();
    signal.addEventListener('abort', handler as EventListener);
    return () => {
      try {
        signal.removeEventListener?.('abort', handler as EventListener);
      } catch {
        // ignore cleanup failures
      }
    };
  }

  // Fallback: onabort handler
  if ('onabort' in signal) {
    const prev = signal.onabort;
    signal.onabort = function (this: AbortSignal, ev: Event) {
      try {
        if (typeof prev === 'function') prev.call(this, ev);
      } finally {
        listener();
      }
    };
    return () => {
      // Restore previous handler
      signal.onabort = prev ?? null;
    };
  }

  // Last resort: no-op cleanup if neither API is present
  return () => {};
}

export interface GenerationAttemptContext {
  planId: string;
  userId: string;
  input: GenerationInput;
}

export interface RunGenerationOptions {
  provider?: AiPlanGenerationProvider;
  timeoutConfig?: Partial<AdaptiveTimeoutConfig>;
  clock?: () => number;
  /**
   * Required. Database client for attempt operations.
   * Use request-scoped getDb() from @/lib/db/runtime in API routes to enforce RLS;
   * use service-role db from @/lib/db/service-role for tests/workers/jobs.
   * @see AttemptsDbClient
   */
  dbClient: AttemptsDbClient;
  now?: () => Date;
  signal?: AbortSignal;
  /**
   * Pre-reserved attempt slot from {@link reserveAttemptSlot}.
   * When provided, the orchestrator skips its internal reservation call and uses
   * this reservation directly. This allows callers (e.g. retry route) to perform
   * the reservation before starting a stream so they can return proper HTTP error
   * codes for rejected attempts.
   */
  reservation?: AttemptReservation;
}

export interface GenerationSuccessResult {
  status: 'success';
  classification: null;
  modules: ParsedModule[];
  rawText: string;
  metadata: ProviderMetadata;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: false;
  attempt: GenerationAttemptRecord;
}

export interface GenerationFailureResult {
  status: 'failure';
  classification: FailureClassification;
  error: unknown;
  metadata?: ProviderMetadata;
  rawText?: string;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: boolean;
  attempt: GenerationAttemptRecordForResponse;
}

export type GenerationResult =
  | GenerationSuccessResult
  | GenerationFailureResult;

/**
 * Failure responses can be synthetic when reservation is rejected before any
 * attempt row exists in the database.
 */
export type GenerationAttemptRecordForResponse =
  | GenerationAttemptRecord
  | (Omit<GenerationAttemptRecord, 'id'> & { id: null });

const DEFAULT_CLOCK = () => Date.now();

function getProvider(
  provider?: AiPlanGenerationProvider
): AiPlanGenerationProvider {
  return provider ?? getGenerationProvider();
}

export async function runGenerationAttempt(
  context: GenerationAttemptContext,
  options: RunGenerationOptions
): Promise<GenerationResult> {
  const clock = options.clock ?? DEFAULT_CLOCK;
  const nowFn = options.now ?? (() => new Date());
  const dbClient = options.dbClient;

  if (
    dbClient == null ||
    typeof dbClient !== 'object' ||
    typeof (dbClient as { select?: unknown }).select !== 'function'
  ) {
    throw new Error(
      'runGenerationAttempt requires dbClient (pass request-scoped getDb() from API routes)'
    );
  }

  // Use pre-reserved slot if provided; otherwise reserve atomically now
  const reservation =
    options.reservation ??
    (await reserveAttemptSlot({
      planId: context.planId,
      userId: context.userId,
      input: context.input,
      dbClient,
      now: nowFn,
    }));

  const attemptClockStart = clock();

  if (!reservation.reserved) {
    const durationMs = Math.max(0, clock() - attemptClockStart);

    // For rejected reservations we cannot finalize a row (none was created).
    // Synthesize a minimal record for response shaping.
    const classification: FailureClassification =
      reservation.reason === 'capped'
        ? 'capped'
        : // "in_progress" means a concurrent generation is already running for this plan;
          // surface it as retryable `rate_limit` for client/backoff handling.
          'rate_limit';
    const errorMessage =
      reservation.reason === 'capped'
        ? 'Generation attempt cap reached'
        : 'A generation is already in progress for this plan (concurrent conflict)';

    // Create a synthetic attempt record for the response
    const syntheticAttempt: GenerationAttemptRecordForResponse = {
      id: null,
      planId: context.planId,
      status: 'failure',
      classification,
      durationMs,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: null,
      metadata: null,
      createdAt: nowFn(),
    };

    logger.warn(
      {
        planId: context.planId,
        userId: context.userId,
        reservationReason: reservation.reason,
        attemptId: 'synthetic:no-db-row',
      },
      'Generation reservation rejected before attempt row creation'
    );

    return {
      status: 'failure',
      classification,
      error: new Error(errorMessage),
      durationMs,
      extendedTimeout: false,
      timedOut: false,
      attempt: syntheticAttempt,
    };
  }

  let provider: AiPlanGenerationProvider;
  let timeout: ReturnType<typeof createAdaptiveTimeout>;
  let controller: AbortController;
  let cleanupTimeoutAbort: () => void;
  let cleanupExternalAbort: (() => void) | undefined;
  const startedAt = attemptClockStart;

  try {
    provider = getProvider(options.provider);
    timeout = createAdaptiveTimeout({
      ...options.timeoutConfig,
      now: clock,
    });

    if (appEnv.isTest) {
      const { captureForTesting } = await import('./capture-for-testing');
      captureForTesting(provider, context.input);
    }

    const externalSignal = options.signal;
    controller = new AbortController();
    const onAbort = () => controller.abort();
    cleanupTimeoutAbort = attachAbortListener(timeout.signal, onAbort);
    cleanupExternalAbort = externalSignal
      ? attachAbortListener(externalSignal, onAbort)
      : undefined;
  } catch (initError) {
    const classification = classifyFailure({
      error: initError,
      timedOut: false,
    });
    const durationMs = Math.max(0, clock() - startedAt);
    const attempt = await finalizeAttemptFailure({
      attemptId: reservation.attemptId,
      planId: context.planId,
      preparation: reservation,
      classification,
      durationMs,
      error: initError,
      dbClient,
      now: nowFn,
    });
    const result: GenerationFailureResult = {
      status: 'failure',
      classification,
      error: initError,
      durationMs,
      extendedTimeout: false,
      timedOut: false,
      attempt,
    };
    return result;
  }

  let providerMetadata: ProviderMetadata | undefined;
  let rawText: string | undefined;

  try {
    const providerResult = await Sentry.startSpan(
      {
        op: 'gen_ai.invoke_agent',
        name: 'invoke_agent Plan Generation',
        attributes: {
          'gen_ai.agent.name': 'Plan Generation',
        },
      },
      async (span) => {
        const result = await provider.generate(context.input, {
          signal: controller.signal,
          timeoutMs: options.timeoutConfig?.baseMs,
        });
        const meta = result.metadata;
        if (meta.model) {
          span.setAttribute('gen_ai.request.model', meta.model);
        }
        if (meta.usage?.promptTokens != null) {
          span.setAttribute(
            'gen_ai.usage.input_tokens',
            meta.usage.promptTokens
          );
        }
        if (meta.usage?.completionTokens != null) {
          span.setAttribute(
            'gen_ai.usage.output_tokens',
            meta.usage.completionTokens
          );
        }
        return result;
      }
    );

    providerMetadata = providerResult.metadata;

    const parsed = await parseGenerationStream(providerResult.stream, {
      onFirstModuleDetected: () => timeout.notifyFirstModule(),
    });

    rawText = parsed.rawText;

    // Apply pacing to trim modules to fit user's time capacity
    const pacedModules = pacePlan(parsed.modules, context.input);

    const durationMs = clock() - startedAt;
    timeout.cancel();
    cleanupTimeoutAbort();
    cleanupExternalAbort?.();

    const attempt = await finalizeAttemptSuccess({
      attemptId: reservation.attemptId,
      planId: context.planId,
      preparation: reservation,
      modules: pacedModules,
      providerMetadata: providerMetadata ?? {},
      durationMs,
      extendedTimeout: timeout.didExtend,
      dbClient,
      now: nowFn,
    });

    return {
      status: 'success',
      classification: null,
      modules: pacedModules,
      rawText,
      metadata: providerMetadata ?? {},
      durationMs,
      extendedTimeout: timeout.didExtend,
      timedOut: false,
      attempt,
    };
  } catch (error) {
    timeout.cancel();
    cleanupTimeoutAbort();
    cleanupExternalAbort?.();
    const durationMs = clock() - startedAt;
    const timedOut = timeout.timedOut || error instanceof ProviderTimeoutError;

    const classification = classifyFailure({ error, timedOut });

    const attempt = await finalizeAttemptFailure({
      attemptId: reservation.attemptId,
      planId: context.planId,
      preparation: reservation,
      classification,
      durationMs,
      timedOut,
      extendedTimeout: timeout.didExtend,
      providerMetadata,
      error,
      dbClient,
      now: nowFn,
    });

    const failure: GenerationFailureResult = {
      status: 'failure',
      classification,
      error,
      metadata: providerMetadata,
      rawText,
      durationMs,
      extendedTimeout: timeout.didExtend,
      timedOut,
      attempt,
    };

    return failure;
  }
}

export type { ParsedGeneration, ParsedModule };
