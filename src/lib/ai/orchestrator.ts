import { appEnv } from '@/lib/config/env';
import {
  recordFailure,
  recordSuccess,
  startAttempt,
  type AttemptsDbClient,
  type GenerationAttemptRecord,
} from '@/lib/db/queries/attempts';
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
  attempt: GenerationAttemptRecord;
}

export type GenerationResult =
  | GenerationSuccessResult
  | GenerationFailureResult;

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

  const preparation = await startAttempt({
    planId: context.planId,
    userId: context.userId,
    input: context.input,
    dbClient,
    now: nowFn,
  });

  const attemptClockStart = clock();

  if (preparation.capped) {
    const durationMs = Math.max(0, clock() - attemptClockStart);
    const attempt = await recordFailure({
      planId: context.planId,
      preparation,
      classification: 'capped',
      durationMs,
      timedOut: false,
      extendedTimeout: false,
      providerMetadata: undefined,
      dbClient,
      now: nowFn,
    });

    return {
      status: 'failure',
      classification: 'capped',
      error: new Error('Generation attempt cap reached'),
      durationMs,
      extendedTimeout: false,
      timedOut: false,
      attempt,
    };
  }

  const provider = getProvider(options.provider);
  const timeout = createAdaptiveTimeout({
    ...options.timeoutConfig,
    now: clock,
  });
  const startedAt = attemptClockStart;

  if (appEnv.isTest) {
    const { captureForTesting } = await import('./capture-for-testing');
    captureForTesting(provider, context.input);
  }

  // Combine timeout signal with external shutdown signal if provided
  const externalSignal = options.signal;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const cleanupTimeoutAbort = attachAbortListener(timeout.signal, onAbort);
  const cleanupExternalAbort = externalSignal
    ? attachAbortListener(externalSignal, onAbort)
    : undefined;

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

    const attempt = await recordSuccess({
      planId: context.planId,
      preparation,
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

    const attempt = await recordFailure({
      planId: context.planId,
      preparation,
      classification,
      durationMs,
      timedOut,
      extendedTimeout: timeout.didExtend,
      providerMetadata,
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
