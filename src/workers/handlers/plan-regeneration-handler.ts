import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { logger } from '@/lib/logging/logger';
import { db } from '@/lib/db/drizzle';
import { learningPlans } from '@/lib/db/schema';
import type { FailureClassification } from '@/lib/types/client';
import { planRegenerationOverridesSchema } from '@/lib/validation/learningPlans';
import {
  JOB_TYPES,
  type Job,
  type PlanGenerationJobData,
  type PlanGenerationJobResult,
} from '@/lib/jobs/types';
import { buildValidationErrorMessage } from '@/lib/jobs/validation-utils';

import { GenerationService } from '../services/generation-service';
import { CurationService } from '../services/curation-service';
import { PersistenceService } from '../services/persistence-service';

const planRegenerationJobDataSchema = z
  .object({
    planId: z.string().uuid('planId must be a valid UUID'),
    overrides: planRegenerationOverridesSchema.optional(),
  })
  .strict();

export interface ProcessPlanRegenerationJobSuccess {
  status: 'success';
  result: PlanGenerationJobResult;
}

export interface ProcessPlanRegenerationJobFailure {
  status: 'failure';
  error: string;
  classification: FailureClassification | 'unknown';
  retryable: boolean;
}

export type ProcessPlanRegenerationJobResult =
  | ProcessPlanRegenerationJobSuccess
  | ProcessPlanRegenerationJobFailure;

/**
 * Handler for plan regeneration jobs.
 * Fetches existing plan, merges with overrides, then orchestrates services.
 */
export class PlanRegenerationHandler {
  constructor(
    private readonly generationService: GenerationService,
    private readonly curationService: CurationService,
    private readonly persistenceService: PersistenceService
  ) {}

  /**
   * Processes a plan regeneration job end-to-end.
   *
   * @param job - The job to process
   * @param opts - Optional abort signal for graceful shutdown
   * @returns Success or failure result with classification
   */
  async processJob(
    job: Job,
    opts?: { signal?: AbortSignal }
  ): Promise<ProcessPlanRegenerationJobResult> {
    if (job.type !== JOB_TYPES.PLAN_REGENERATION) {
      return {
        status: 'failure',
        error: `Unsupported job type: ${String(job.type)}`,
        classification: 'unknown',
        retryable: false,
      };
    }

    if (!job.planId) {
      const error = 'Regeneration job missing planId';

      await this.persistenceService.failJob({
        jobId: job.id,
        planId: null,
        userId: job.userId,
        error,
        retryable: false,
      });

      return {
        status: 'failure',
        error,
        classification: 'validation',
        retryable: false,
      };
    }

    const parsedPayload = planRegenerationJobDataSchema.safeParse(job.data);
    if (!parsedPayload.success) {
      const message = buildValidationErrorMessage(parsedPayload.error);

      await this.persistenceService.failJob({
        jobId: job.id,
        planId: job.planId,
        userId: job.userId,
        error: message,
        retryable: false,
      });

      return {
        status: 'failure',
        error: message,
        classification: 'validation',
        retryable: false,
      };
    }
    const overrides = parsedPayload.data.overrides;

    try {
      // Fetch current plan to get existing values
      const plan = await db.query.learningPlans.findFirst({
        where: eq(learningPlans.id, job.planId),
      });

      if (!plan) {
        const error = 'Plan not found for regeneration';

        await this.persistenceService.failJob({
          jobId: job.id,
          planId: job.planId,
          userId: job.userId,
          error,
          retryable: false,
        });

        return {
          status: 'failure',
          error,
          classification: 'validation',
          retryable: false,
        };
      }

      // Merge plan values with overrides
      const mergedInput: PlanGenerationJobData = {
        topic: overrides?.topic ?? plan.topic,
        notes: overrides?.notes ?? null,
        skillLevel: overrides?.skillLevel ?? plan.skillLevel,
        weeklyHours: overrides?.weeklyHours ?? plan.weeklyHours,
        learningStyle: overrides?.learningStyle ?? plan.learningStyle,
        startDate:
          overrides?.startDate ??
          (plan.startDate ? String(plan.startDate) : null),
        deadlineDate:
          overrides?.deadlineDate ??
          (plan.deadlineDate ? String(plan.deadlineDate) : null),
      };

      const result = await this.generationService.generatePlan(mergedInput, {
        planId: job.planId,
        userId: job.userId,
        signal: opts?.signal,
      });

      if (result.status === 'success') {
        const jobResult: PlanGenerationJobResult = {
          modulesCount: result.modules.length,
          tasksCount: result.modules.reduce(
            (sum, module) => sum + module.tasks.length,
            0
          ),
          durationMs: result.durationMs,
          metadata: {
            provider: result.metadata ?? null,
            attemptId: result.attemptId,
          },
        };

        // Run curation if enabled
        if (CurationService.shouldRunCuration()) {
          const runCuration = () =>
            this.curationService
              .curateAndAttachResources({
                planId: job.planId!,
                topic: mergedInput.topic,
                skillLevel: mergedInput.skillLevel,
              })
              .catch((curationError) => {
                logger.error(
                  {
                    planId: job.planId,
                    jobId: job.id,
                    error: curationError,
                    event: 'plan_regeneration_curation_failed',
                  },
                  'Curation failed during plan regeneration job'
                );
              });

          if (CurationService.shouldRunSync()) {
            await runCuration();
          } else {
            void runCuration();
          }
        }

        await this.persistenceService.completeJob({
          jobId: job.id,
          planId: job.planId,
          userId: job.userId,
          result: jobResult,
          metadata: result.metadata,
        });

        return {
          status: 'success',
          result: jobResult,
        };
      }

      const classification = result.classification ?? 'unknown';
      const retryable =
        classification !== 'validation' && classification !== 'capped';
      const message =
        result.error instanceof Error
          ? result.error.message
          : typeof result.error === 'string'
            ? result.error
            : 'Regeneration failed.';

      await this.persistenceService.failJob({
        jobId: job.id,
        planId: job.planId,
        userId: job.userId,
        error: message,
        retryable,
        metadata: result.metadata,
      });

      return {
        status: 'failure',
        error: message,
        classification,
        retryable,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message || 'Unexpected error processing regeneration job.'
          : 'Unexpected error processing regeneration job.';

      await this.persistenceService.failJob({
        jobId: job.id,
        planId: job.planId ?? null,
        userId: job.userId,
        error: message,
        retryable: true,
      });

      return {
        status: 'failure',
        error: message,
        classification: 'unknown',
        retryable: true,
      };
    }
  }
}
