import { ZodError, z } from 'zod';

import { runGenerationAttempt, type ParsedModule } from '@/lib/ai/orchestrator';
import type { ProviderMetadata } from '@/lib/ai/provider';
import { RouterGenerationProvider } from '@/lib/ai/providers/router';
import { generateMicroExplanation } from '@/lib/ai/micro-explanations';
import { curateDocs } from '@/lib/curation/docs';
import { curationConfig } from '@/lib/curation/config';
import { selectTop, type Scored } from '@/lib/curation/ranking';
import { curateYouTube } from '@/lib/curation/youtube';
import { upsertAndAttach } from '@/lib/db/queries/resources';
import {
  appendTaskDescription,
  getTasksByPlanId,
} from '@/lib/db/queries/tasks';
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

    // Use router-based provider with failover (mock in tests if configured)
    const provider = new RouterGenerationProvider();

    const result = await runGenerationAttempt(
      {
        planId: job.planId,
        userId: job.userId,
        input: {
          topic: payload.topic,
          notes: payload.notes,
          skillLevel: payload.skillLevel,
          weeklyHours: payload.weeklyHours,
          learningStyle: payload.learningStyle,
          startDate: payload.startDate,
          deadlineDate: payload.deadlineDate,
        },
      },
      { provider }
    );

    if (result.status === 'success') {
      const jobResult = buildJobResult(
        result.modules,
        result.durationMs,
        result.attempt.id,
        result.metadata
      );

      // Curation and micro-explanations (if enabled)
      if (curationConfig.enableCuration) {
        try {
          await maybeCurateAndAttachResources(job.planId, payload, job.userId);
        } catch (curationError) {
          // Log but don't fail the job
          console.error('Curation failed:', curationError);
        }
      }

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

      // Record AI usage even on failure when provider reports token usage
      const failedUsage = result.metadata?.usage;
      await recordUsage({
        userId: job.userId,
        provider: result.metadata?.provider ?? 'unknown',
        model: result.metadata?.model ?? 'unknown',
        inputTokens: failedUsage?.promptTokens ?? undefined,
        outputTokens: failedUsage?.completionTokens ?? undefined,
        costCents: 0,
      });
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

/**
 * Curation and micro-explanations integration
 * Curates resources for each task and optionally generates micro-explanations
 */
async function maybeCurateAndAttachResources(
  planId: string,
  params: PlanGenerationJobData,
  _userId: string
): Promise<void> {
  const CURATION_CONCURRENCY = curationConfig.concurrency;
  const TIME_BUDGET_MS = curationConfig.timeBudgetMs;
  const startTime = Date.now();

  // Get all tasks for the plan
  const taskRows = await getTasksByPlanId(planId);

  console.log(
    `[Curation] Starting curation for ${taskRows.length} tasks in plan ${planId}`
  );

  // Prepare curation params
  const curationParams = {
    query: params.topic,
    minScore: curationConfig.minResourceScore,
    maxResults: curationConfig.maxResults,
    cacheVersion: curationConfig.cacheVersion,
  };

  // Process tasks with simple batching to enforce concurrency without extra deps
  for (let i = 0; i < taskRows.length; i += CURATION_CONCURRENCY) {
    // Check time budget before starting a new batch
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      console.log(
        `[Curation] Time budget exceeded before starting batch at index ${i}, stopping curation.`
      );
      break;
    }

    const batch = taskRows.slice(i, i + CURATION_CONCURRENCY);
    await Promise.all(
      batch.map(async (taskRow) => {
        const { task, moduleTitle } = taskRow;
        // Check time budget before processing individual task
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          console.log(
            `[Curation] Time budget exceeded, skipping task ${task.id}`
          );
          return;
        }

        try {
          // Curate resources
          const candidates = await curateTaskResources(
            task.title,
            curationParams,
            params.skillLevel
          );

          if (candidates.length > 0) {
            await upsertAndAttach(task.id, candidates);
            console.log(
              `[Curation] Attached ${candidates.length} resources to task ${task.id}`
            );
          }

          // Generate and append micro-explanation
          try {
            // Skip micro-explanations if time budget is already exhausted
            if (Date.now() - startTime > TIME_BUDGET_MS) {
              console.log(
                `[Curation] Time budget exceeded before micro-explanation for task ${task.id}`
              );
              return;
            }
            const provider = new RouterGenerationProvider();
            const microExplanation = await generateMicroExplanation(provider, {
              topic: params.topic,
              moduleTitle,
              taskTitle: task.title,
              skillLevel: params.skillLevel,
            });
            const marker = `<!-- micro-explanation-${task.id} -->`;
            if (task.description?.includes(marker)) {
              console.log(
                `[Curation] Skipping micro-explanation for task ${task.id}; already present`
              );
              return;
            }
            const markedExplanation = `${marker}\n${microExplanation}`;
            await appendTaskDescription(task.id, markedExplanation);
            task.description = task.description
              ? `${task.description}\n\n${markedExplanation}`
              : markedExplanation;
            console.log(
              `[Curation] Added micro-explanation to task ${task.id}`
            );
          } catch (explanationError) {
            console.error(
              `[Curation] Failed to generate micro-explanation for task ${task.id}:`,
              explanationError
            );
            // Continue with other tasks - don't fail curation for micro-explanation errors
          }
        } catch (error) {
          console.error(`[Curation] Failed to curate task ${task.id}:`, error);
          // Continue with other tasks
        }
      })
    );

    // Check time budget after batch completion (though the pre-batch check will catch for next)
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      console.log(
        `[Curation] Time budget exceeded after batch at index ${i}, stopping curation.`
      );
      break;
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Curation] Completed in ${elapsed}ms`);
}

/**
 * Curate resources for a single task
 * Blends YouTube and docs results with diversity preference
 */
async function curateTaskResources(
  taskTitle: string,
  params: {
    query: string;
    minScore: number;
    maxResults: number;
    cacheVersion: string;
  },
  _skillLevel: 'beginner' | 'intermediate' | 'advanced'
): Promise<Scored[]> {
  const candidates: Scored[] = [];

  // Search YouTube
  try {
    const ytResults = await curateYouTube({
      ...params,
      query: `${params.query} ${taskTitle}`,
    });
    candidates.push(...ytResults);
  } catch (error) {
    console.error('[Curation] YouTube search failed:', error);
  }

  // Search docs if needed
  if (candidates.length < params.maxResults) {
    try {
      const docResults = await curateDocs({
        ...params,
        query: `${params.query} ${taskTitle}`,
      });
      candidates.push(...docResults);
    } catch (error) {
      console.error('[Curation] Docs search failed:', error);
    }
  }

  // Blend and select top candidates with diversity preference
  const top = selectTop(candidates, {
    minScore: params.minScore,
    maxItems: params.maxResults,
    preferDiversity: true,
    earlyStopEnabled: true,
  });

  return top;
}
