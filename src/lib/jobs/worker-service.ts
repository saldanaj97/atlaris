import { ZodError, z } from 'zod';

import { runGenerationAttempt, type ParsedModule } from '@/lib/ai/orchestrator';
import type { ProviderMetadata } from '@/lib/ai/provider';
import { recordUsage } from '@/lib/db/usage';
import {
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from '@/lib/stripe/usage';
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
} from './types';

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
  } satisfies PlanGenerationJobData;
}

function buildJobResult(
  modules: ParsedModule[],
  durationMs: number,
  attemptId: string,
  providerMetadata: ProviderMetadata | undefined
): PlanGenerationJobResult {
  const modulesCount = modules.length;
  const tasksCount = modules.reduce(
    (sum, module) => sum + module.tasks.length,
    0
  );

  return {
    modulesCount,
    tasksCount,
    durationMs,
    metadata: {
      provider: providerMetadata ?? null,
      attemptId,
    },
  } satisfies PlanGenerationJobResult;
}

export async function processPlanGenerationJob(
  job: Job
): Promise<ProcessPlanGenerationJobResult> {
  if (job.type !== JOB_TYPES.PLAN_GENERATION) {
    return {
      status: 'failure',
      error: `Unsupported job type: ${String(job.type)}`,
      classification: 'unknown',
      retryable: false,
    } satisfies ProcessPlanGenerationJobFailure;
  }

  if (!job.planId) {
    return {
      status: 'failure',
      error: 'Plan generation job is missing a planId.',
      classification: 'validation',
      retryable: false,
    } satisfies ProcessPlanGenerationJobFailure;
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
    } satisfies ProcessPlanGenerationJobFailure;
  }

  try {
    // Note: Budget enforcement happens atomically when the plan is created
    // in generateLearningPlan action (via atomicCheckAndInsertPlan).
    // No need to check again here as the plan already exists.

    // Use default provider selection which honors AI_PROVIDER and test env
    const result = await runGenerationAttempt({
      planId: job.planId,
      userId: job.userId,
      input: {
        topic: payload.topic,
        notes: payload.notes,
        skillLevel: payload.skillLevel,
        weeklyHours: payload.weeklyHours,
        learningStyle: payload.learningStyle,
      },
    });

    if (result.status === 'success') {
      const jobResult = buildJobResult(
        result.modules,
        result.durationMs,
        result.attempt.id,
        result.metadata
      );

      await markPlanGenerationSuccess(job.planId);

      // Record usage on success
      const usage = result.metadata?.usage;
      await recordUsage({
        userId: job.userId,
        provider: result.metadata?.provider ?? 'unknown',
        model: result.metadata?.model ?? 'unknown',
        inputTokens: usage?.promptTokens ?? undefined,
        outputTokens: usage?.completionTokens ?? undefined,
        costCents: 0,
        kind: 'plan',
      });

      return {
        status: 'success',
        result: jobResult,
      } satisfies ProcessPlanGenerationJobSuccess;
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
      await markPlanGenerationFailure(job.planId);
    }

    return {
      status: 'failure',
      error: message,
      classification,
      retryable,
    } satisfies ProcessPlanGenerationJobFailure;
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
    } satisfies ProcessPlanGenerationJobFailure;
  }
}
