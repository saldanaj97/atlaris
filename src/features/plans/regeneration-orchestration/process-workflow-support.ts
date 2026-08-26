import type { RegenerationOrchestrationDeps } from './deps';
import type { PlanRegenerationJobPayload } from './schema';
import type { ProcessPlanRegenerationJobResult } from './types';
import type { Job } from '@/features/jobs/types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { PlanRegenerationWorkflowTerminalResult } from '@/features/plans/workflows/plan-regeneration.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';

import {
  buildPersistedRegenerationInput,
  rawRegenerationOverridesHaveImmutableFields,
} from './admission';
import { planRegenerationJobPayloadSchema } from './schema';
import { assertNever, serializeErrorForLog } from '@/lib/errors';
import { learningPlans } from '@supabase/schema';
import { eq } from 'drizzle-orm';

const INVALID_JOB_PAYLOAD_MESSAGE = 'Invalid plan regeneration job payload.';
const PLAN_NOT_FOUND_MESSAGE = 'Plan not found for queued regeneration.';
const IMMUTABLE_OVERRIDE_MESSAGE =
  'Queued regeneration overrides cannot change topic or notes.';

export type RegenerationPlanRow = typeof learningPlans.$inferSelect;

type ValidatedJobPayload =
  | { ok: true; payload: PlanRegenerationJobPayload }
  | { ok: false; result: ProcessPlanRegenerationJobResult };

type ValidatedJobPayloadWithoutFail =
  | { ok: true; payload: PlanRegenerationJobPayload }
  | { ok: false };

export function buildRegenerationGenerationInput(
  payload: PlanRegenerationJobPayload,
  plan: RegenerationPlanRow,
): GenerationInput {
  return buildPersistedRegenerationInput(plan, payload.overrides);
}

function buildSanitizedGenerationFailureMessage(
  classification: string,
): string {
  return `Plan regeneration failed (${classification}).`;
}

function summarizeSuccessfulGeneration(
  result: Extract<GenerationAttemptResult, { status: 'generation_success' }>,
) {
  const modules = result.data.modules;
  const durationMs =
    Number.isFinite(result.data.durationMs) && result.data.durationMs >= 0
      ? result.data.durationMs
      : 0;

  return {
    modulesCount: modules.length,
    tasksCount: modules.reduce(
      (total, module) => total + (module.tasks?.length ?? 0),
      0,
    ),
    durationMs,
  };
}

export async function validateQueuedRegenerationPayloadForJob(
  job: Job,
): Promise<ValidatedJobPayloadWithoutFail> {
  if (rawRegenerationOverridesHaveImmutableFields(job.data)) {
    return { ok: false };
  }

  const parsed = planRegenerationJobPayloadSchema.safeParse(job.data);
  if (!parsed.success) {
    return { ok: false };
  }

  if (job.planId !== parsed.data.planId) {
    return { ok: false };
  }

  return { ok: true, payload: parsed.data };
}

export async function validateQueuedRegenerationPayload(
  job: Job,
  deps: RegenerationOrchestrationDeps,
): Promise<ValidatedJobPayload> {
  if (rawRegenerationOverridesHaveImmutableFields(job.data)) {
    await deps.queue.failJob(job.id, IMMUTABLE_OVERRIDE_MESSAGE, {
      retryable: false,
    });
    return { ok: false, result: { kind: 'invalid-payload', jobId: job.id } };
  }

  const parsed = planRegenerationJobPayloadSchema.safeParse(job.data);
  if (!parsed.success) {
    await deps.queue.failJob(job.id, INVALID_JOB_PAYLOAD_MESSAGE, {
      retryable: false,
    });
    return { ok: false, result: { kind: 'invalid-payload', jobId: job.id } };
  }

  const payload = parsed.data;

  if (job.planId !== payload.planId) {
    deps.logger.error(
      {
        jobId: job.id,
        jobPlanId: job.planId,
        payloadPlanId: payload.planId,
      },
      'Queued plan regeneration job metadata mismatch',
    );
    await deps.queue.failJob(job.id, INVALID_JOB_PAYLOAD_MESSAGE, {
      retryable: false,
    });
    return { ok: false, result: { kind: 'invalid-payload', jobId: job.id } };
  }

  return { ok: true, payload };
}

export async function loadAuthorizedRegenerationPlan(
  payload: PlanRegenerationJobPayload,
  job: Job,
  deps: RegenerationOrchestrationDeps,
): Promise<RegenerationPlanRow | null> {
  const plan = await deps.dbClient.query.learningPlans.findFirst({
    where: eq(learningPlans.id, payload.planId),
  });

  if (!plan || plan.userId !== job.userId) {
    return null;
  }

  const access = await deps.plans.readContentAccess(
    plan.id,
    job.userId,
    deps.dbClient,
  );
  if (access !== 'full') {
    return null;
  }

  return plan;
}

export async function applyRegenerationGenerationResult(
  context: { job: Job; plan: RegenerationPlanRow },
  result: GenerationAttemptResult,
  deps: RegenerationOrchestrationDeps,
): Promise<PlanRegenerationWorkflowTerminalResult> {
  switch (result.status) {
    case 'generation_success': {
      const summary = summarizeSuccessfulGeneration(result);
      await deps.queue.completeJob(context.job.id, {
        planId: context.plan.id,
        ...summary,
      });
      return {
        kind: 'completed',
        jobId: context.job.id,
        planId: context.plan.id,
      };
    }
    case 'retryable_failure': {
      const failureMessage = buildSanitizedGenerationFailureMessage(
        result.classification,
      );
      const failedJob = await deps.queue.failJob(
        context.job.id,
        failureMessage,
        {
          retryable: true,
        },
      );
      const willRetry = failedJob?.status === 'pending';
      deps.logger.info(
        {
          jobId: context.job.id,
          planId: context.plan.id,
          classification: result.classification,
          message: failureMessage,
          queueStatus: failedJob?.status ?? null,
          attemptNumber: failedJob?.attempts ?? context.job.attempts + 1,
          maxAttempts: failedJob?.maxAttempts ?? context.job.maxAttempts,
          willRetry,
        },
        'Regeneration job retryable failure — queue outcome applied',
      );
      deps.logger.debug(
        {
          jobId: context.job.id,
          planId: context.plan.id,
          error: serializeErrorForLog(result.error),
        },
        'Regeneration job retryable failure diagnostic',
      );
      return {
        kind: 'retryable-failure',
        jobId: context.job.id,
        planId: context.plan.id,
        willRetry,
      };
    }
    case 'permanent_failure': {
      deps.logger.error(
        {
          jobId: context.job.id,
          classification: result.classification,
          error: result.error,
        },
        'Regeneration job permanent failure',
      );
      await deps.queue.failJob(
        context.job.id,
        buildSanitizedGenerationFailureMessage(result.classification),
        {
          retryable: false,
        },
      );
      return {
        kind: 'permanent-failure',
        jobId: context.job.id,
        planId: context.plan.id,
      };
    }
    case 'already_finalized': {
      deps.logger.info(
        { jobId: context.job.id, planId: context.plan.id },
        'Regeneration job: plan already finalized — completing queue job idempotently',
      );
      await deps.queue.completeJob(context.job.id, {
        planId: context.plan.id,
        modulesCount: 0,
        tasksCount: 0,
        durationMs: 0,
      });
      return {
        kind: 'already-finalized',
        jobId: context.job.id,
        planId: context.plan.id,
      };
    }
    default:
      assertNever(result);
  }
}

export async function failRegenerationJobForMissingPlanInWorkflow(
  jobId: string,
  deps: RegenerationOrchestrationDeps,
): Promise<void> {
  await deps.queue.failJob(jobId, PLAN_NOT_FOUND_MESSAGE, { retryable: false });
}
