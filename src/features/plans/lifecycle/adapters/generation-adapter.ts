// fallow-ignore-file unused-class-member
/**
 * GenerationAdapter — production implementation of GenerationPort.
 *
 * Wraps the AI orchestrator's `runGenerationExecution()` (no DB attempt finalize),
 * mapping between the port interface and the orchestrator's types.
 * Lifecycle {@link GenerationFinalizationPort} persists attempt + plan + usage atomically.
 * Handles model/provider resolution internally via `resolveModelForTier()`.
 * Normalizes raw provider metadata into CanonicalAIUsage at the boundary.
 */

import { resolveModelForTier } from '@/features/ai/model-resolver';
import { runGenerationExecution } from '@/features/ai/orchestrator';
import { safeNormalizeUsage } from '@/features/ai/usage';

import type { GenerationInput } from '@/features/ai/types/provider.types';
import type { DbClient } from '@/lib/db/types';
import type {
  GenerationPort,
  GenerationRunParams,
  GenerationRunResult,
} from '../ports';
import type { GeneratedModule } from '../types';

export class GenerationAdapter implements GenerationPort {
  constructor(private readonly dbClient: DbClient) {}

  async runGeneration(
    params: GenerationRunParams,
  ): Promise<GenerationRunResult> {
    const { provider } = resolveModelForTier(
      params.tier,
      params.modelOverride ?? undefined,
    );

    const generationInput: GenerationInput = {
      topic: params.input.topic,
      skillLevel: params.input.skillLevel,
      weeklyHours: params.input.weeklyHours,
      learningStyle: params.input.learningStyle,
      startDate: params.input.startDate,
      deadlineDate: params.input.deadlineDate,
      notes: params.input.notes,
    };

    const exec = await runGenerationExecution(
      {
        planId: params.planId,
        userId: params.userId,
        input: generationInput,
      },
      {
        provider,
        dbClient: this.dbClient,
        signal: params.signal,
        ...(params.allowedGenerationStatuses !== undefined
          ? { allowedGenerationStatuses: params.allowedGenerationStatuses }
          : {}),
        ...(params.requiredGenerationStatus !== undefined
          ? { requiredGenerationStatus: params.requiredGenerationStatus }
          : {}),
        ...(params.onAttemptReserved !== undefined
          ? { onAttemptReserved: params.onAttemptReserved }
          : {}),
      },
    );

    if (exec.kind === 'failure_rejected') {
      const result = exec.result;
      return {
        status: 'failure',
        classification: result.classification,
        error: result.error,
        metadata: result.metadata as Record<string, unknown> | undefined,
        usage: result.metadata
          ? safeNormalizeUsage(result.metadata)
          : undefined,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        extendedTimeout: result.extendedTimeout,
        ...(result.reservationRejectionReason !== undefined
          ? { reservationRejectionReason: result.reservationRejectionReason }
          : {}),
      };
    }

    if (exec.kind === 'failure_reserved') {
      return {
        status: 'failure',
        classification: exec.classification,
        error: exec.error,
        metadata: exec.metadata as Record<string, unknown> | undefined,
        usage: exec.metadata ? safeNormalizeUsage(exec.metadata) : undefined,
        durationMs: exec.durationMs,
        reservation: exec.reservation,
        timedOut: exec.timedOut,
        extendedTimeout: exec.extendedTimeout,
      };
    }

    return {
      status: 'success',
      modules: exec.modules as GeneratedModule[],
      metadata: exec.metadata as Record<string, unknown>,
      usage: safeNormalizeUsage(exec.metadata),
      durationMs: exec.durationMs,
      reservation: exec.reservation,
      extendedTimeout: exec.extendedTimeout,
    };
  }
}
