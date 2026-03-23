/**
 * GenerationAdapter — production implementation of GenerationPort.
 *
 * Wraps the AI orchestrator's `runGenerationAttempt()` function,
 * mapping between the port interface and the orchestrator's types.
 * Handles model/provider resolution internally via `resolveModelForTier()`.
 * Normalizes raw provider metadata into CanonicalAIUsage at the boundary.
 */

import { resolveModelForTier } from '@/features/ai/model-resolver';
import { runGenerationAttempt } from '@/features/ai/orchestrator';
import type { GenerationInput } from '@/features/ai/types/provider.types';
import { safeNormalizeUsage } from '@/features/ai/usage';
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
    params: GenerationRunParams
  ): Promise<GenerationRunResult> {
    const { provider } = resolveModelForTier(
      params.tier,
      params.modelOverride ?? undefined
    );

    const generationInput: GenerationInput = {
      topic: params.input.topic,
      skillLevel: params.input.skillLevel,
      weeklyHours: params.input.weeklyHours,
      learningStyle: params.input.learningStyle,
      startDate: params.input.startDate,
      deadlineDate: params.input.deadlineDate,
      notes: params.input.notes,
      pdfContext: params.input.pdfContext ?? undefined,
      pdfExtractionHash: params.input.pdfExtractionHash,
      pdfProofVersion: params.input.pdfProofVersion,
    };

    const result = await runGenerationAttempt(
      {
        planId: params.planId,
        userId: params.userId,
        input: generationInput,
      },
      {
        provider,
        dbClient: this.dbClient,
        signal: params.signal,
      }
    );

    if (result.status === 'success') {
      return {
        status: 'success',
        modules: result.modules as GeneratedModule[],
        metadata: result.metadata as Record<string, unknown>,
        usage: safeNormalizeUsage(result.metadata),
        durationMs: result.durationMs,
      };
    }

    return {
      status: 'failure',
      classification: result.classification,
      error: result.error,
      metadata: result.metadata as Record<string, unknown> | undefined,
      usage: result.metadata ? safeNormalizeUsage(result.metadata) : undefined,
      durationMs: result.durationMs,
    };
  }
}
