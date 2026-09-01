import type {
  AttemptOperations,
  AttemptOperationsOverrides,
  GenerationAttemptContext,
  GenerationExecutionResult,
  RunGenerationOptions,
} from '@/features/ai/types/orchestrator.types';
import type { ProviderMetadata } from '@/features/ai/types/provider.types';

import { buildUnfinalizedReservedFailure } from '@/features/ai/orchestrator/attempt-failures';
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
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { isAttemptsDbClient } from '@/lib/db/queries/helpers/attempts-db-client';
import { parseGenerationPurpose } from '@/shared/types/generation-purpose';

const DEFAULT_CLOCK = () => Date.now();

function resolveAttemptOperations(
  overrides?: AttemptOperationsOverrides,
): AttemptOperations {
  return {
    reserveAttemptSlot: overrides?.reserveAttemptSlot ?? reserveAttemptSlot,
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
      'runGenerationExecution requires dbClient (pass serviceRoleDb from server-owned generation boundaries, or an explicit test client)',
    );
  }

  const attemptOps = resolveAttemptOperations(options.attemptOperations);
  const timeoutConfig = resolveTimeoutConfig(options.timeoutConfig, clock);
  const attemptClockStart = clock();
  const generationPurpose = parseGenerationPurpose(context.generationPurpose);

  if (
    options.reservation &&
    options.reservation.generationPurpose !== generationPurpose
  ) {
    throw new Error(
      `Stale generation reservation ${options.reservation.attemptId} for plan ${context.planId}: purpose ${options.reservation.generationPurpose} does not match ${generationPurpose}.`,
    );
  }

  const reservation =
    options.reservation ??
    (await attemptOps.reserveAttemptSlot({
      planId: context.planId,
      userId: context.userId,
      input: context.input,
      generationPurpose,
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
    await options.onAttemptReserved?.(reservation);

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
