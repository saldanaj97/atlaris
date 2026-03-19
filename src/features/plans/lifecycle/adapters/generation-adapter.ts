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
import { safeNormalizeUsage } from '@/features/ai/usage';
import type { PdfContext } from '@/features/pdf/context.types';
import type { GenerationInput } from '@/features/ai/types/provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { DbClient } from '@/lib/db/types';

import type { GenerationPort } from '../ports';
import type {
  FailureClassification,
  GeneratedModule,
  SubscriptionTier,
} from '../types';

export class GenerationAdapter implements GenerationPort {
  constructor(private readonly dbClient: DbClient) {}

  async runGeneration(params: {
    planId: string;
    userId: string;
    tier: SubscriptionTier;
    input: {
      topic: string;
      skillLevel: 'beginner' | 'intermediate' | 'advanced';
      weeklyHours: number;
      learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
      startDate?: string | null;
      deadlineDate?: string | null;
      notes?: string | null;
      pdfContext?: PdfContext | null;
      pdfExtractionHash?: string;
      pdfProofVersion?: 1;
    };
    modelOverride?: string | null;
    signal?: AbortSignal;
  }): Promise<
    | {
        status: 'success';
        modules: GeneratedModule[];
        metadata: Record<string, unknown>;
        usage: CanonicalAIUsage;
        durationMs: number;
      }
    | {
        status: 'failure';
        classification: FailureClassification;
        error: Error;
        metadata?: Record<string, unknown>;
        usage?: CanonicalAIUsage;
        durationMs: number;
      }
  > {
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
