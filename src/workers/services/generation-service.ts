import type { ProviderMetadata } from '@/lib/ai/provider';
import { runGenerationAttempt, type ParsedModule } from '@/lib/ai/orchestrator';
import type { GenerationProvider } from '@/lib/ai/provider';
import type { FailureClassification } from '@/lib/types/client';

export interface GenerationInput {
  topic: string;
  notes: string | null;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  startDate: string | null;
  deadlineDate: string | null;
}

export interface GenerationContext {
  planId: string;
  userId: string;
  signal?: AbortSignal;
}

export interface GenerationSuccessResult {
  status: 'success';
  modules: ParsedModule[];
  durationMs: number;
  attemptId: string;
  metadata?: ProviderMetadata;
}

export interface GenerationFailureResult {
  status: 'failure';
  error: Error | string;
  classification: FailureClassification | 'unknown';
  metadata?: ProviderMetadata;
}

export type GenerationResult =
  | GenerationSuccessResult
  | GenerationFailureResult;

/**
 * Service responsible for AI-powered learning plan generation.
 * Wraps the orchestrator and provides a clean interface for the worker handler.
 */
export class GenerationService {
  constructor(private readonly provider: GenerationProvider) {}

  /**
   * Generates a learning plan using the configured AI provider.
   *
   * @param input - The plan parameters (topic, skill level, etc.)
   * @param context - The execution context (planId, userId, abort signal)
   * @returns A result indicating success with modules or failure with classification
   */
  async generatePlan(
    input: GenerationInput,
    context: GenerationContext
  ): Promise<GenerationResult> {
    try {
      const result = await runGenerationAttempt(
        {
          planId: context.planId,
          userId: context.userId,
          input: {
            topic: input.topic,
            notes: input.notes,
            skillLevel: input.skillLevel,
            weeklyHours: input.weeklyHours,
            learningStyle: input.learningStyle,
            startDate: input.startDate,
            deadlineDate: input.deadlineDate,
          },
        },
        { provider: this.provider, signal: context.signal }
      );

      if (result.status === 'success') {
        return {
          status: 'success',
          modules: result.modules,
          durationMs: result.durationMs,
          attemptId: result.attempt.id,
          metadata: result.metadata,
        };
      }

      const classification = result.classification ?? 'unknown';
      const error =
        result.error instanceof Error
          ? result.error
          : typeof result.error === 'string'
            ? result.error
            : 'Plan generation failed.';

      return {
        status: 'failure',
        error,
        classification,
        metadata: result.metadata,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error
          : 'Unexpected error during plan generation.';

      return {
        status: 'failure',
        error: message,
        classification: 'unknown',
      };
    }
  }
}
