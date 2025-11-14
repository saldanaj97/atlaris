import { ZodError, z } from 'zod';

import { appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import { runGenerationAttempt, type ParsedModule } from '@/lib/ai/orchestrator';
import type { ProviderMetadata } from '@/lib/ai/provider';
import { getGenerationProvider } from '@/lib/ai/provider-factory';
import { generateMicroExplanation } from '@/lib/ai/micro-explanations';
import { curateDocs } from '@/lib/curation/docs';
import { curationConfig } from '@/lib/curation/config';
import { selectTop, type Scored } from '@/lib/curation/ranking';
import { curateYouTube } from '@/lib/curation/youtube';
import { db } from '@/lib/db/drizzle';
import { learningPlans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { upsertAndAttach } from '@/lib/db/queries/resources';
import {
  appendTaskMicroExplanation,
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
  planRegenerationOverridesSchema,
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

const planRegenerationJobDataSchema = z
  .object({
    planId: z.string().uuid('planId must be a valid UUID'),
    overrides: planRegenerationOverridesSchema.optional(),
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
  job: Job,
  opts?: { signal?: AbortSignal }
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

    // Use configured provider (mock in tests, router with failover in production)
    const provider = getGenerationProvider();

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
      { provider, signal: opts?.signal }
    );

    if (result.status === 'success') {
      const planId = job.planId;
      const jobResult = buildJobResult(
        result.modules,
        result.durationMs,
        result.attempt.id,
        result.metadata
      );

      // Curation and micro-explanations (if enabled)
      // In production we run this fire-and-forget to avoid blocking the job.
      // In tests, await for determinism so integration tests can assert effects.
      if (curationConfig.enableCuration) {
        const runCuration = () =>
          maybeCurateAndAttachResources(planId, payload, job.userId).catch(
            (curationError) => {
              logger.error(
                {
                  planId,
                  jobId: job.id,
                  error: curationError,
                  event: 'plan_generation_curation_failed',
                },
                'Curation failed during plan generation job'
              );
            }
          );

        if (appEnv.isTest) {
          await runCuration();
        } else {
          void runCuration();
        }
      }

      await markPlanGenerationSuccess(planId);

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
      const planId = job.planId;
      await markPlanGenerationFailure(planId);

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

export type ProcessPlanRegenerationJobResult =
  | ProcessPlanGenerationJobSuccess
  | ProcessPlanGenerationJobFailure;

export async function processPlanRegenerationJob(
  job: Job,
  opts?: { signal?: AbortSignal }
): Promise<ProcessPlanRegenerationJobResult> {
  if (job.type !== JOB_TYPES.PLAN_REGENERATION) {
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
      error: 'Regeneration job missing planId',
      classification: 'validation',
      retryable: false,
    } satisfies ProcessPlanGenerationJobFailure;
  }

  const parsedPayload = planRegenerationJobDataSchema.safeParse(job.data);
  if (!parsedPayload.success) {
    const message = buildValidationErrorMessage(parsedPayload.error);
    return {
      status: 'failure',
      error: message,
      classification: 'validation',
      retryable: false,
    } satisfies ProcessPlanGenerationJobFailure;
  }
  const overrides = parsedPayload.data.overrides;

  try {
    // Fetch current plan to get existing values
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, job.planId),
    });

    if (!plan) {
      return {
        status: 'failure',
        error: 'Plan not found for regeneration',
        classification: 'validation',
        retryable: false,
      } satisfies ProcessPlanGenerationJobFailure;
    }

    // Merge plan values with overrides
    const mergedInput: PlanGenerationJobData = {
      topic: overrides?.topic ?? plan.topic,
      // TODO: Persist plan-level notes once learning_plans includes a notes column so regenerations can carry them forward.
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

    // Use configured provider (mock in tests, router with failover in production)
    const provider = getGenerationProvider();

    const result = await runGenerationAttempt(
      {
        planId: job.planId,
        userId: job.userId,
        input: mergedInput,
      },
      { provider, signal: opts?.signal }
    );

    if (result.status === 'success') {
      const planId = job.planId;
      const jobResult = buildJobResult(
        result.modules,
        result.durationMs,
        result.attempt.id,
        result.metadata
      );

      // Curation and micro-explanations (if enabled)
      // In production we run this fire-and-forget to avoid blocking the job.
      // In tests, await for determinism so integration tests can assert effects.
      if (curationConfig.enableCuration) {
        const runCuration = () =>
          maybeCurateAndAttachResources(planId, mergedInput, job.userId).catch(
            (curationError) => {
              logger.error(
                {
                  planId,
                  jobId: job.id,
                  error: curationError,
                  event: 'plan_regeneration_curation_failed',
                },
                'Curation failed during plan regeneration job'
              );
            }
          );

        if (appEnv.isTest) {
          await runCuration();
        } else {
          void runCuration();
        }
      }

      await markPlanGenerationSuccess(planId);

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
          : 'Regeneration failed.';

    if (!retryable) {
      const planId = job.planId;
      await markPlanGenerationFailure(planId);

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
        ? error.message || 'Unexpected error processing regeneration job.'
        : 'Unexpected error processing regeneration job.';

    return {
      status: 'failure',
      error: message,
      classification: 'unknown',
      retryable: true,
    } satisfies ProcessPlanGenerationJobFailure;
  }
}

/**
 * Curates and attaches resources for each task in a learning plan and optionally generates micro-explanations.
 *
 * Processes tasks in batches according to the configured concurrency and respects the configured time budget.
 * For each task it attempts to find candidate resources and attach them, and it may prepend a generated
 * micro-explanation to the task description. Individual task errors (curation or micro-explanation) are
 * logged and do not stop processing of other tasks.
 *
 * @param planId - The identifier of the plan whose tasks will be curated
 * @param params - Plan generation input (uses fields such as `topic` and `skillLevel` to drive curation)
 * @param _userId - Caller user id (currently unused by the curation flow)
 */
async function maybeCurateAndAttachResources(
  planId: string,
  params: PlanGenerationJobData,
  _userId: string
): Promise<void> {
  const CURATION_CONCURRENCY = curationConfig.concurrency;
  const TIME_BUDGET_MS = curationConfig.timeBudgetMs;
  const startTime = Date.now();
  const curationLogger = logger.child({
    source: 'plan_curation',
    planId,
  });

  // Get all tasks for the plan
  const taskRows = await getTasksByPlanId(planId);

  curationLogger.info(
    {
      taskCount: taskRows.length,
    },
    'Starting resource curation'
  );

  // Prepare curation params
  const curationParams = {
    query: params.topic,
    minScore: curationConfig.minResourceScore,
    maxResults: curationConfig.maxResults,
  };

  // Process tasks with simple batching to enforce concurrency without extra deps
  for (let i = 0; i < taskRows.length; i += CURATION_CONCURRENCY) {
    // Check time budget before starting a new batch
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      curationLogger.warn(
        {
          batchIndex: i,
          elapsedMs: Date.now() - startTime,
        },
        'Time budget exceeded before starting batch, stopping curation'
      );
      break;
    }

    const batch = taskRows.slice(i, i + CURATION_CONCURRENCY);
    await Promise.all(
      batch.map(async (taskRow) => {
        const { task, moduleTitle } = taskRow;
        // Check time budget before processing individual task
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          curationLogger.warn(
            {
              taskId: task.id,
              elapsedMs: Date.now() - startTime,
            },
            'Time budget exceeded, skipping task'
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
            curationLogger.info(
              {
                taskId: task.id,
                resourceCount: candidates.length,
              },
              'Attached curated resources to task'
            );
          } else {
            curationLogger.info(
              {
                taskId: task.id,
                minScore: curationParams.minScore,
              },
              'No curated resources met cutoff for task'
            );
          }

          // Generate and append micro-explanation
          try {
            // Skip if task already has a micro-explanation
            if (task.hasMicroExplanation) {
              curationLogger.info(
                {
                  taskId: task.id,
                },
                'Skipping micro-explanation; already present'
              );
              return;
            }
            // Skip micro-explanations if time budget is already exhausted
            if (Date.now() - startTime > TIME_BUDGET_MS) {
              curationLogger.warn(
                {
                  taskId: task.id,
                  elapsedMs: Date.now() - startTime,
                },
                'Time budget exceeded before micro-explanation generation'
              );
              return;
            }
            const provider = getGenerationProvider();
            const microExplanation = await generateMicroExplanation(provider, {
              topic: params.topic,
              moduleTitle,
              taskTitle: task.title,
              skillLevel: params.skillLevel,
            });
            // Use appendTaskMicroExplanation which handles duplicate prevention via flag
            const updatedDescription = await appendTaskMicroExplanation(
              task.id,
              microExplanation
            );
            // Update local task object from DB-side result to avoid drift
            task.description = updatedDescription;
            task.hasMicroExplanation = true;
            curationLogger.info(
              {
                taskId: task.id,
              },
              'Added micro-explanation to task'
            );
          } catch (explanationError) {
            curationLogger.error(
              {
                taskId: task.id,
                error: explanationError,
              },
              'Failed to generate micro-explanation for task'
            );
            // Continue with other tasks - don't fail curation for micro-explanation errors
          }
        } catch (error) {
          curationLogger.error(
            {
              taskId: task.id,
              error,
            },
            'Failed to curate task'
          );
          // Continue with other tasks
        }
      })
    );

    // Check time budget after batch completion (though the pre-batch check will catch for next)
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      curationLogger.warn(
        {
          batchIndex: i,
          elapsedMs: Date.now() - startTime,
        },
        'Time budget exceeded after batch, stopping curation'
      );
      break;
    }
  }

  const elapsed = Date.now() - startTime;
  curationLogger.info(
    {
      elapsedMs: elapsed,
    },
    'Completed curation run'
  );
}

/**
 * Curates and selects a ranked set of resources for a single task.
 *
 * Performs a YouTube-first search using `params.query` combined with `taskTitle`, falls back to docs when YouTube yields no results meeting `minScore`, and skips docs if enough high-scoring YouTube results are found; the final list is filtered and ranked with a diversity preference.
 *
 * @param taskTitle - The task title appended to the base query to scope searches
 * @param params.query - Base search query or topic used for discovery
 * @param params.minScore - Score cutoff; resources with numeric scores below this value are considered invalid
 * @param params.maxResults - Maximum number of resources to return
 * @returns The top-scored resources after blending and selecting candidates according to `minScore`, `maxResults`, and diversity preferences
 */
async function curateTaskResources(
  taskTitle: string,
  params: {
    query: string;
    minScore: number;
    maxResults: number;
  },
  _skillLevel: 'beginner' | 'intermediate' | 'advanced'
): Promise<Scored[]> {
  const candidates: Scored[] = [];
  const searchLogger = logger.child({
    source: 'plan_curation_search',
    taskTitle,
  });

  // Search YouTube first
  let ytResults: Scored[] = [];
  try {
    ytResults = await curateYouTube({
      ...params,
      query: `${params.query} ${taskTitle}`,
    });
    candidates.push(...ytResults);
  } catch (error) {
    searchLogger.error(
      {
        error,
      },
      'YouTube search failed during curation'
    );
  }

  // Determine validity against cutoff
  const validYtCount = ytResults.filter(
    (r) => r.numericScore >= params.minScore
  ).length;

  // Early-stop: enough high-scoring YT results
  if (validYtCount >= params.maxResults) {
    // proceed to selection without docs
  } else if (validYtCount < 1) {
    // Fallback: Try docs when YT yields <1 valid candidate
    try {
      const docResults = await curateDocs({
        ...params,
        query: `${params.query} ${taskTitle}`,
      });
      candidates.push(...docResults);
    } catch (error) {
      searchLogger.error(
        {
          error,
        },
        'Docs search failed during curation'
      );
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
