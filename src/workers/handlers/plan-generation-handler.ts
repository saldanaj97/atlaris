import { ZodError, z } from 'zod';

import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/lib/types/client';
import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  weeklyHoursSchema,
} from '@/lib/validation/learningPlans';
import {
  JOB_TYPES,
  type Job,
  type PlanGenerationJobData,
  type PlanGenerationJobResult,
} from '@/lib/jobs/types';

import { GenerationService } from '../services/generation-service';
import { CurationService } from '../services/curation-service';
import { PersistenceService } from '../services/persistence-service';

const planGenerationJobDataSchema = z
  .object({
    topic: z
      .string()
      .trim()
      .min(3, 'topic must be at least 3 characters long.')
      .max(
        TOPIC_MAX_LENGTH,
        `topic must be ${TOPIC_MAX_LENGTH} characters or fewer.`
      ),
    notes: z
      .string()
      .trim()
      .max(
        NOTES_MAX_LENGTH,
        `notes must be ${NOTES_MAX_LENGTH} characters or fewer.`
      )
      .optional()
      .nullable()
      .transform((value) => {
        if (value === null || value === undefined) {
          return null;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }),
    skillLevel: z.enum(['beginner', 'intermediate', 'advanced'] as const),
    weeklyHours: weeklyHoursSchema,
    learningStyle: z.enum(['reading', 'video', 'practice', 'mixed'] as const),
    startDate: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        'Start date must be a valid ISO date string.'
      )
      .transform((value) => (value ? value : null)),
    deadlineDate: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        'Deadline date must be a valid ISO date string.'
      )
      .transform((value) => (value ? value : null)),
  })
  .strict();

export interface ProcessPlanGenerationJobSuccess {
  status: 'success';
  result: PlanGenerationJobResult;
}

export interface ProcessPlanGenerationJobFailure {
  status: 'failure';
  error: string;
  classification: FailureClassification | 'unknown';
  retryable: boolean;
}

export type ProcessPlanGenerationJobResult =
  | ProcessPlanGenerationJobSuccess
  | ProcessPlanGenerationJobFailure;

function buildValidationErrorMessage(error: ZodError): string {
  const details = error.issues.map((issue) => issue.message).join('; ');
  return details.length
    ? `Invalid job data: ${details}`
    : 'Invalid job data payload.';
}

function toPlanGenerationJobData(data: unknown): PlanGenerationJobData {
  const parsed = planGenerationJobDataSchema.parse(data);
  return {
    topic: parsed.topic,
    notes: parsed.notes ?? null,
    skillLevel: parsed.skillLevel,
    weeklyHours: parsed.weeklyHours,
    learningStyle: parsed.learningStyle,
    startDate: parsed.startDate ?? null,
    deadlineDate: parsed.deadlineDate ?? null,
  } satisfies PlanGenerationJobData;
}

/**
 * Handler for plan generation jobs.
 * Orchestrates GenerationService, CurationService, and PersistenceService.
 */
export class PlanGenerationHandler {
  constructor(
    private readonly generationService: GenerationService,
    private readonly curationService: CurationService,
    private readonly persistenceService: PersistenceService
  ) {}

  /**
   * Processes a plan generation job end-to-end.
   *
   * @param job - The job to process
   * @param opts - Optional abort signal for graceful shutdown
   * @returns Success or failure result with classification
   */
  async processJob(
    job: Job,
    opts?: { signal?: AbortSignal }
  ): Promise<ProcessPlanGenerationJobResult> {
    if (job.type !== JOB_TYPES.PLAN_GENERATION) {
      return {
        status: 'failure',
        error: `Unsupported job type: ${String(job.type)}`,
        classification: 'unknown',
        retryable: false,
      };
    }

    if (!job.planId) {
      return {
        status: 'failure',
        error: 'Plan generation job is missing a planId.',
        classification: 'validation',
        retryable: false,
      };
    }

    let payload: PlanGenerationJobData;
    try {
      payload = toPlanGenerationJobData(job.data);
    } catch (error) {
      const message =
        error instanceof ZodError
          ? buildValidationErrorMessage(error)
          : 'Invalid job payload.';

      return {
        status: 'failure',
        error: message,
        classification: 'validation',
        retryable: false,
      };
    }

    try {
      const result = await this.generationService.generatePlan(
        {
          topic: payload.topic,
          notes: payload.notes,
          skillLevel: payload.skillLevel,
          weeklyHours: payload.weeklyHours,
          learningStyle: payload.learningStyle,
          startDate: payload.startDate,
          deadlineDate: payload.deadlineDate,
        },
        {
          planId: job.planId,
          userId: job.userId,
          signal: opts?.signal,
        }
      );

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
                topic: payload.topic,
                skillLevel: payload.skillLevel,
              })
              .catch((curationError) => {
                logger.error(
                  {
                    planId: job.planId,
                    jobId: job.id,
                    error: curationError,
                    event: 'plan_generation_curation_failed',
                  },
                  'Curation failed during plan generation job'
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
            : 'Plan generation failed.';

      if (!retryable) {
        await this.persistenceService.failJob({
          jobId: job.id,
          planId: job.planId,
          userId: job.userId,
          error: message,
          retryable: false,
          metadata: result.metadata,
        });
      }

      return {
        status: 'failure',
        error: message,
        classification,
        retryable,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message || 'Unexpected error processing plan generation job.'
          : 'Unexpected error processing plan generation job.';

      return {
        status: 'failure',
        error: message,
        classification: 'unknown',
        retryable: true,
      };
    }
  }
}
