import {
  buildUnfinalizedReservedFailure,
  finalizeReservedExecutionFailure,
} from '@/features/ai/orchestrator/attempt-failures';
import { generateWithInstrumentation } from '@/features/ai/orchestrator/provider-invocation';
import { createReservationRejectionResult } from '@/features/ai/orchestrator/reservation';
import {
  cleanupTimeoutLifecycle,
  resolveTimeoutConfig,
  setupAbortAndTimeout,
  type TimeoutLifecycle,
} from '@/features/ai/orchestrator/timeout-lifecycle';
import { pacePlan } from '@/features/ai/pacing';
import { parseGenerationStream } from '@/features/ai/parser';
import { getGenerationProvider } from '@/features/ai/providers/factory';
import {
  finalizeAttemptFailure,
  finalizeAttemptSuccess,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import { isAttemptsDbClient } from '@/lib/db/queries/helpers/attempts-db-client';

import type {
  AttemptOperations,
  AttemptOperationsOverrides,
  GenerationAttemptContext,
  GenerationExecutionResult,
  GenerationResult,
  RunGenerationOptions,
} from '@/features/ai/types/orchestrator.types';
import type { ProviderMetadata } from '@/features/ai/types/provider.types';

const DEFAULT_CLOCK = () => Date.now();

function resolveAttemptOperations(
  overrides?: AttemptOperationsOverrides,
): AttemptOperations {
  return {
    reserveAttemptSlot: overrides?.reserveAttemptSlot ?? reserveAttemptSlot,
    finalizeAttemptSuccess:
      overrides?.finalizeAttemptSuccess ?? finalizeAttemptSuccess,
    finalizeAttemptFailure:
      overrides?.finalizeAttemptFailure ?? finalizeAttemptFailure,
  };
}

/**
 * Provider → parse → pace without persisting attempt outcome.
 * Lifecycle finalization owns the single transactional settlement after this returns.
 */
export async function runGenerationExecution(
  context: GenerationAttemptContext,
  options: RunGenerationOptions,
): Promise<GenerationExecutionResult> {
  const clock = options.clock ?? DEFAULT_CLOCK;
  const nowFn = options.now ?? (() => new Date());
  const dbClient = options.dbClient;

  if (!isAttemptsDbClient(dbClient)) {
    throw new Error(
      'runGenerationExecution requires dbClient (pass request-scoped getDb() from API routes)',
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
      ...(options.allowedGenerationStatuses !== undefined
        ? { allowedGenerationStatuses: options.allowedGenerationStatuses }
        : {}),
      ...(options.requiredGenerationStatus !== undefined
        ? { requiredGenerationStatus: options.requiredGenerationStatus }
        : {}),
    }));

  if (!reservation.reserved) {
    return {
      kind: 'failure_rejected',
      result: createReservationRejectionResult(
        context,
        reservation,
        attemptClockStart,
        clock,
        nowFn,
      ),
    };
  }

  let providerMetadata: ProviderMetadata | undefined;
  let rawText: string | undefined;
  let timeoutLifecycle: TimeoutLifecycle | undefined;

  try {
    const provider = options.provider ?? getGenerationProvider();
    options.onAttemptReserved?.(reservation);

    const { controller, ...lifecycle } = setupAbortAndTimeout(
      timeoutConfig,
      options.signal,
    );
    timeoutLifecycle = lifecycle;
    const { timeout } = lifecycle;
    const providerResult = await generateWithInstrumentation(
      provider,
      context.input,
      {
        signal: controller.signal,
        timeoutMs: timeoutConfig.baseMs,
      },
    );
    providerMetadata = providerResult.metadata;

    const parsed = await parseGenerationStream(providerResult.stream, {
      onFirstModuleDetected: () => timeout.notifyFirstModule(),
      signal: controller.signal,
    });
    rawText = parsed.rawText;

    const modules = pacePlan(parsed.modules, context.input);
    const durationMs = Math.max(0, clock() - attemptClockStart);
    cleanupTimeoutLifecycle(timeoutLifecycle);

    const metadata = providerMetadata ?? {};

    return {
      kind: 'success',
      reservation,
      modules,
      rawText: parsed.rawText,
      metadata,
      durationMs,
      extendedTimeout: timeout.didExtend,
    };
  } catch (error) {
    return buildUnfinalizedReservedFailure({
      error,
      reservation,
      attemptClockStart,
      clock,
      timeoutLifecycle,
      providerMetadata,
      rawText,
    });
  }
}

/** Reserve + generate + finalize attempt row (modules/tasks) in DB. Plan lifecycle + usage finalization stay separate. */
export async function runGenerationAttempt(
  context: GenerationAttemptContext,
  options: RunGenerationOptions,
): Promise<GenerationResult> {
  const nowFn = options.now ?? (() => new Date());
  const dbClient = options.dbClient;
  const attemptOps = resolveAttemptOperations(options.attemptOperations);

  const exec = await runGenerationExecution(context, options);

  if (exec.kind === 'failure_rejected') {
    return exec.result;
  }

  if (exec.kind === 'failure_reserved') {
    return finalizeReservedExecutionFailure({
      unfinalized: exec,
      attemptOps,
      context,
      dbClient,
      nowFn,
    });
  }

  const attempt = await attemptOps.finalizeAttemptSuccess({
    attemptId: exec.reservation.attemptId,
    planId: context.planId,
    preparation: exec.reservation,
    modules: exec.modules,
    providerMetadata: exec.metadata,
    durationMs: exec.durationMs,
    extendedTimeout: exec.extendedTimeout,
    dbClient,
    now: nowFn,
  });

  return {
    status: 'success',
    classification: null,
    modules: exec.modules,
    rawText: exec.rawText,
    metadata: exec.metadata,
    durationMs: exec.durationMs,
    extendedTimeout: exec.extendedTimeout,
    timedOut: false,
    attempt,
  };
}
