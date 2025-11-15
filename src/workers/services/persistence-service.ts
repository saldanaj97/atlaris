import type { ProviderMetadata } from '@/lib/ai/provider';
import { recordUsage } from '@/lib/db/usage';
import { completeJob, failJob, type FailJobOptions } from '@/lib/jobs/queue';
import type { PlanGenerationJobResult } from '@/lib/jobs/types';
import {
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from '@/lib/stripe/usage';

export interface JobCompletionInput {
  jobId: string;
  planId: string;
  userId: string;
  result: PlanGenerationJobResult;
  metadata?: ProviderMetadata;
}

export interface JobFailureInput {
  jobId: string;
  planId: string | null;
  userId: string;
  error: string;
  retryable: boolean;
  metadata?: ProviderMetadata;
}

export interface UsageRecordInput {
  userId: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents: number;
  kind: 'plan';
}

/**
 * Service responsible for persisting job state and tracking usage.
 * Handles job completion/failure, Stripe billing integration, and AI usage tracking.
 */
export class PersistenceService {
  /**
   * Marks a job as completed and records successful plan generation.
   *
   * @param input - Job completion details including result and metadata
   */
  async completeJob(input: JobCompletionInput): Promise<void> {
    const { jobId, planId, userId, result, metadata } = input;

    await completeJob(jobId, result);
    await markPlanGenerationSuccess(planId);

    await this.recordPlanUsage(userId, metadata);
  }

  /**
   * Marks a job as failed and optionally records usage for non-retryable failures.
   *
   * @param input - Job failure details including error and retryability
   */
  async failJob(input: JobFailureInput): Promise<void> {
    const { jobId, planId, userId, error, retryable, metadata } = input;

    const failOptions: FailJobOptions | undefined = retryable
      ? undefined
      : { retryable: false };

    await failJob(jobId, error, failOptions);

    if (!retryable && planId) {
      await markPlanGenerationFailure(planId);
      await this.recordPlanUsage(userId, metadata);
    }
  }

  /**
   * Records plan generation usage from provider metadata.
   *
   * @param userId - User ID for usage tracking
   * @param metadata - Provider metadata containing usage information
   */
  private async recordPlanUsage(
    userId: string,
    metadata?: ProviderMetadata
  ): Promise<void> {
    const usage = metadata?.usage;
    const usageRecord: UsageRecordInput = {
      userId,
      provider: metadata?.provider ?? 'unknown',
      model: metadata?.model ?? 'unknown',
      inputTokens: usage?.promptTokens ?? undefined,
      outputTokens: usage?.completionTokens ?? undefined,
      costCents: 0,
      kind: 'plan',
    };
    await recordUsage(usageRecord);
  }
}
