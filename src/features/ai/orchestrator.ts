import { aiTimeoutEnv } from '@/lib/config/env';
import {
  finalizeAttemptFailure,
  finalizeAttemptSuccess,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import { isAttemptsDbClient } from '@/lib/db/queries/helpers/attempts-helpers';
import { logger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/nextjs';
import { attachAbortListener } from './abort';
import { classifyFailure } from './classification';
import { pacePlan } from './pacing';
import { parseGenerationStream } from './parser';
import { ProviderTimeoutError } from './providers/errors';
import { getGenerationProvider } from './providers/factory';
import { createAdaptiveTimeout } from './timeout';

import type {
  AttemptOperationsOverrides,
  GenerationAttemptContext,
  GenerationAttemptRecordForResponse,
  GenerationFailureResult,
  GenerationResult,
  RunGenerationOptions,
} from '@/features/ai/types/orchestrator.types';
import type {
  AiPlanGenerationProvider,
  ProviderMetadata,
} from '@/features/ai/types/provider.types';
import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';
import type {
  AttemptRejection,
  AttemptReservation,
  AttemptsDbClient,
  FinalizeFailureParams,
} from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/types/client.types';

const DEFAULT_CLOCK = () => Date.now();

type AttemptOps = {
  reserveAttemptSlot: typeof reserveAttemptSlot;
  finalizeAttemptSuccess: typeof finalizeAttemptSuccess;
  finalizeAttemptFailure: typeof finalizeAttemptFailure;
};

type TimeoutLifecycle = {
  timeout: ReturnType<typeof createAdaptiveTimeout>;
  cleanupTimeoutAbort: () => void;
  cleanupExternalAbort: (() => void) | undefined;
};

const RESERVATION_REJECTION_DETAILS: Record<
  AttemptRejection['reason'],
  {
    classification: FailureClassification;
    message: (reservation: AttemptRejection) => string;
  }
> = {
  capped: {
    classification: 'capped',
    message: () => 'Generation attempt cap reached',
  },
  rate_limited: {
    classification: 'rate_limit',
    message: () => 'Generation rate limit exceeded for this user',
  },
  in_progress: {
    classification: 'rate_limit',
    message: () =>
      'A generation is already in progress for this plan (concurrent conflict)',
  },
  invalid_status: {
    classification: 'validation',
    message: (reservation) =>
      `Generation attempt is not allowed for plan status: ${reservation.currentStatus ?? 'unknown'}`,
  },
};

const SYNTHETIC_FAILURE_ATTEMPT_DEFAULTS = {
  id: null,
  status: 'failure',
  modulesCount: 0,
  tasksCount: 0,
  truncatedTopic: false,
  truncatedNotes: false,
  normalizedEffort: false,
  metadata: null,
} as const;

function resolveAttemptOperations(
  overrides?: AttemptOperationsOverrides
): AttemptOps {
  return {
    reserveAttemptSlot: overrides?.reserveAttemptSlot ?? reserveAttemptSlot,
    finalizeAttemptSuccess:
      overrides?.finalizeAttemptSuccess ?? finalizeAttemptSuccess,
    finalizeAttemptFailure:
      overrides?.finalizeAttemptFailure ?? finalizeAttemptFailure,
  };
}

function toGenerationError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return new Error(error);
  }

  let detail: string;
  if (error && typeof error === 'object') {
    try {
      detail = JSON.stringify(error);
    } catch {
      detail = Object.prototype.toString.call(error);
    }
  } else if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint' ||
    typeof error === 'symbol'
  ) {
    detail = String(error);
  } else {
    detail = 'no additional detail';
  }

  return new Error(`Unknown generation error: ${detail}`);
}

function createSyntheticFailureAttempt(params: {
  planId: string;
  classification: FailureClassification;
  durationMs: number;
  promptHash: string | null;
  now: () => Date;
}): GenerationAttemptRecordForResponse {
  const { planId, classification, durationMs, promptHash, now } = params;

  return {
    ...SYNTHETIC_FAILURE_ATTEMPT_DEFAULTS,
    planId,
    classification,
    durationMs,
    promptHash,
    createdAt: now(),
  };
}

function resolveTimeoutConfig(
  timeoutConfig?: Partial<AdaptiveTimeoutConfig>,
  clock?: () => number
): AdaptiveTimeoutConfig {
  const {
    baseMs = aiTimeoutEnv.baseMs,
    extensionMs = aiTimeoutEnv.extensionMs,
    extensionThresholdMs = aiTimeoutEnv.extensionThresholdMs,
  } = timeoutConfig ?? {};

  return {
    baseMs,
    extensionMs,
    extensionThresholdMs,
    now: clock,
  };
}

async function safelyFinalizeFailure(
  attemptOps: AttemptOps,
  finalizeParams: FinalizeFailureParams,
  fallbackPromptHash: string
): Promise<GenerationAttemptRecordForResponse> {
  try {
    return await attemptOps.finalizeAttemptFailure(finalizeParams);
  } catch (finalizeError) {
    logger.error(
      {
        planId: finalizeParams.planId,
        attemptId: finalizeParams.attemptId,
        finalizeError,
        originalError: finalizeParams.error,
      },
      'Failed to finalize generation attempt failure'
    );

    return createSyntheticFailureAttempt({
      planId: finalizeParams.planId,
      classification: finalizeParams.classification,
      durationMs: finalizeParams.durationMs,
      promptHash: fallbackPromptHash,
      now: finalizeParams.now ?? (() => new Date()),
    });
  }
}

function createFailureResult(params: {
  classification: FailureClassification;
  error: Error;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: boolean;
  attempt: GenerationAttemptRecordForResponse;
  metadata?: ProviderMetadata;
  rawText?: string;
}): GenerationFailureResult {
  const { metadata, rawText, ...rest } = params;

  return {
    ...rest,
    status: 'failure',
    ...(metadata !== undefined && { metadata }),
    ...(rawText !== undefined && { rawText }),
  };
}

function createReservationRejectionResult(
  context: GenerationAttemptContext,
  reservation: AttemptRejection,
  attemptClockStart: number,
  clock: () => number,
  nowFn: () => Date
): GenerationFailureResult {
  const durationMs = Math.max(0, clock() - attemptClockStart);
  const rejection = RESERVATION_REJECTION_DETAILS[reservation.reason];
  const classification = rejection.classification;
  const errorMessage = rejection.message(reservation);

  const attempt = createSyntheticFailureAttempt({
    planId: context.planId,
    classification,
    durationMs,
    promptHash: null,
    now: nowFn,
  });

  logger.warn(
    {
      planId: context.planId,
      userId: context.userId,
      classification,
      errorMessage,
      reservationReason: reservation.reason,
      reservationCurrentStatus: reservation.currentStatus,
      attemptId: 'synthetic:no-db-row',
    },
    'Generation reservation rejected before attempt row creation'
  );

  return createFailureResult({
    classification,
    error: new Error(errorMessage),
    durationMs,
    extendedTimeout: false,
    timedOut: false,
    attempt,
  });
}

function setupAbortAndTimeout(
  timeoutConfig: AdaptiveTimeoutConfig,
  externalSignal?: AbortSignal
): TimeoutLifecycle & { controller: AbortController } {
  const timeout = createAdaptiveTimeout(timeoutConfig);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const cleanupTimeoutAbort = attachAbortListener(timeout.signal, onAbort);
  const cleanupExternalAbort = externalSignal
    ? attachAbortListener(externalSignal, onAbort)
    : undefined;

  return { timeout, controller, cleanupTimeoutAbort, cleanupExternalAbort };
}

async function generateWithInstrumentation(
  provider: AiPlanGenerationProvider,
  input: GenerationAttemptContext['input'],
  options: {
    signal: AbortSignal;
    timeoutMs: number;
  }
): Promise<Awaited<ReturnType<AiPlanGenerationProvider['generate']>>> {
  return Sentry.startSpan(
    {
      op: 'gen_ai.invoke_agent',
      name: 'invoke_agent Plan Generation',
      attributes: {
        'gen_ai.agent.name': 'Plan Generation',
      },
    },
    async (span) => {
      const result = await provider.generate(input, options);
      const metadata = result.metadata;

      if (metadata.model) {
        span.setAttribute('gen_ai.request.model', metadata.model);
      }
      if (metadata.usage?.promptTokens != null) {
        span.setAttribute(
          'gen_ai.usage.input_tokens',
          metadata.usage.promptTokens
        );
      }
      if (metadata.usage?.completionTokens != null) {
        span.setAttribute(
          'gen_ai.usage.output_tokens',
          metadata.usage.completionTokens
        );
      }

      return result;
    }
  );
}

async function finalizeGenerationFailure(params: {
  error: unknown;
  reservation: AttemptReservation;
  attemptOps: AttemptOps;
  context: GenerationAttemptContext;
  attemptClockStart: number;
  clock: () => number;
  nowFn: () => Date;
  dbClient: AttemptsDbClient;
  timeoutLifecycle?: TimeoutLifecycle;
  providerMetadata?: ProviderMetadata;
  rawText?: string;
}): Promise<GenerationFailureResult> {
  const {
    error,
    reservation,
    attemptOps,
    context,
    attemptClockStart,
    clock,
    nowFn,
    dbClient,
    timeoutLifecycle,
    providerMetadata,
    rawText,
  } = params;

  timeoutLifecycle?.timeout.cancel();
  timeoutLifecycle?.cleanupTimeoutAbort();
  timeoutLifecycle?.cleanupExternalAbort?.();

  const durationMs = Math.max(0, clock() - attemptClockStart);
  const normalizedError = toGenerationError(error);
  const timedOut =
    (timeoutLifecycle?.timeout.timedOut ?? false) ||
    normalizedError instanceof ProviderTimeoutError;
  const extendedTimeout = timeoutLifecycle?.timeout.didExtend ?? false;
  const classification = classifyFailure({
    error: normalizedError,
    timedOut,
  });

  const attempt = await safelyFinalizeFailure(
    attemptOps,
    {
      attemptId: reservation.attemptId,
      planId: context.planId,
      preparation: reservation,
      classification,
      durationMs,
      timedOut,
      extendedTimeout,
      providerMetadata,
      error: normalizedError,
      dbClient,
      now: nowFn,
    },
    reservation.promptHash
  );

  return createFailureResult({
    classification,
    error: normalizedError,
    durationMs,
    extendedTimeout,
    timedOut,
    attempt,
    metadata: providerMetadata,
    rawText,
  });
}

export async function runGenerationAttempt(
  context: GenerationAttemptContext,
  options: RunGenerationOptions
): Promise<GenerationResult> {
  const clock = options.clock ?? DEFAULT_CLOCK;
  const nowFn = options.now ?? (() => new Date());
  const dbClient = options.dbClient;

  if (!isAttemptsDbClient(dbClient)) {
    throw new Error(
      'runGenerationAttempt requires dbClient (pass request-scoped getDb() from API routes)'
    );
  }

  const attemptOps = resolveAttemptOperations(options.attemptOperations);
  const timeoutConfig = resolveTimeoutConfig(options.timeoutConfig, clock);
  const attemptClockStart = clock();

  const reservation =
    options.reservation ??
    (await attemptOps.reserveAttemptSlot({
      planId: context.planId,
      userId: context.userId,
      input: context.input,
      dbClient,
      now: nowFn,
    }));

  if (!reservation.reserved) {
    return createReservationRejectionResult(
      context,
      reservation,
      attemptClockStart,
      clock,
      nowFn
    );
  }

  const provider = options.provider ?? getGenerationProvider();

  let setup: ReturnType<typeof setupAbortAndTimeout>;
  try {
    setup = setupAbortAndTimeout(timeoutConfig, options.signal);
  } catch (error) {
    return finalizeGenerationFailure({
      error,
      reservation,
      attemptOps,
      context,
      attemptClockStart,
      clock,
      nowFn,
      dbClient,
    });
  }

  const { timeout, controller, cleanupTimeoutAbort, cleanupExternalAbort } =
    setup;
  let providerMetadata: ProviderMetadata | undefined;
  let rawText: string | undefined;

  try {
    const providerResult = await generateWithInstrumentation(
      provider,
      context.input,
      {
        signal: controller.signal,
        timeoutMs: timeoutConfig.baseMs,
      }
    );
    providerMetadata = providerResult.metadata;

    const parsed = await parseGenerationStream(providerResult.stream, {
      onFirstModuleDetected: () => timeout.notifyFirstModule(),
      signal: controller.signal,
    });
    rawText = parsed.rawText;

    const modules = pacePlan(parsed.modules, context.input);
    const durationMs = Math.max(0, clock() - attemptClockStart);
    timeout.cancel();
    cleanupTimeoutAbort();
    cleanupExternalAbort?.();

    const metadata = providerMetadata ?? {};
    const attempt = await attemptOps.finalizeAttemptSuccess({
      attemptId: reservation.attemptId,
      planId: context.planId,
      preparation: reservation,
      modules,
      providerMetadata: metadata,
      durationMs,
      extendedTimeout: timeout.didExtend,
      dbClient,
      now: nowFn,
    });

    return {
      status: 'success',
      classification: null,
      modules,
      rawText: parsed.rawText,
      metadata,
      durationMs,
      extendedTimeout: timeout.didExtend,
      timedOut: false,
      attempt,
    };
  } catch (error) {
    return finalizeGenerationFailure({
      error,
      reservation,
      attemptOps,
      context,
      attemptClockStart,
      clock,
      nowFn,
      dbClient,
      timeoutLifecycle: {
        timeout,
        cleanupTimeoutAbort,
        cleanupExternalAbort,
      },
      providerMetadata,
      rawText,
    });
  }
}
