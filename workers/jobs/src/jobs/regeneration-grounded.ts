import type { GroundedRegenerationStages } from '@/features/jobs/regeneration-run';
import type { Logger } from '@/lib/logging/logger';
import type { WorkflowStep } from 'cloudflare:workers';

import { runOutlineQualitySteps } from '../workflows/plan-generation/outline';
import { runPlanResearchSteps } from '../workflows/plan-generation/research';
import { REGENERATION_JOB_TAG } from './regeneration-shared';
import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';

type InlineStepConfig = { readonly retries?: { readonly limit: number } };

/**
 * Runs Workflow-style steps inline for the queue consumer: each callback is
 * retried up to its `retries.limit` with no delay or durable result, so a
 * redelivered message runs the steps again.
 */
export function createInlineStep(): Pick<WorkflowStep, 'do'> {
  async function run<T>(
    config: InlineStepConfig,
    callback: (ctx: { attempt: number }) => Promise<T>,
  ): Promise<T> {
    const limit = config.retries?.limit ?? 0;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await callback({ attempt });
      } catch (error) {
        if (attempt > limit) {
          throw error;
        }
      }
    }
  }
  const step = {
    do: (
      _name: string,
      configOrCallback:
        | InlineStepConfig
        | ((ctx: { attempt: number }) => Promise<unknown>),
      maybeCallback?: (ctx: { attempt: number }) => Promise<unknown>,
    ) =>
      typeof configOrCallback === 'function'
        ? run({}, configOrCallback)
        : run(configOrCallback, maybeCallback ?? (async () => undefined)),
  };
  // The inline runner keeps `do`'s call shape; durability does not apply.
  return step as unknown as Pick<WorkflowStep, 'do'>;
}

/**
 * Grounded regeneration stages for the queue consumer (JCS-162): the plan
 * generation Workflow's research and outline-quality steps, run inline.
 */
export function createGroundedRegenerationStages(deps: {
  /** `isDirectResearchEnabled()`: the `parallel-direct-research` flag (DEV-171). */
  readonly isDirectResearchEnabled: () => Promise<boolean>;
  readonly logger: Pick<Logger, 'info' | 'warn'>;
}): GroundedRegenerationStages {
  const log =
    (planId: string) =>
    (
      step: string,
      fields: Record<string, unknown>,
      level: 'info' | 'warn' = 'info',
    ) => {
      deps.logger[level](
        { job: REGENERATION_JOB_TAG, planId, step, ...fields },
        'Grounded regeneration step',
      );
    };

  return {
    isEnabled: isGroundedEnabled,
    research: async (stage) => {
      const outcome = await runPlanResearchSteps(createInlineStep(), {
        planId: stage.planId,
        userId: stage.userId,
        tier: stage.tier,
        input: stage.input,
        guidance: stage.guidance,
        directSearch: await deps.isDirectResearchEnabled(),
        attemptStartedAt: stage.attemptStartedAt,
        withDb: (fn) => fn(stage.db),
        log: log(stage.planId),
      });
      return outcome.status === 'ok' ? outcome.research : null;
    },
    outlineQuality: (stage, modules) =>
      runOutlineQualitySteps(
        createInlineStep(),
        {
          planId: stage.planId,
          userId: stage.userId,
          tier: stage.tier,
          purpose: 'regeneration',
          modelOverride: stage.modelOverride,
          input: stage.input,
          research: stage.research,
          attemptStartedAt: stage.attemptStartedAt,
          withDb: (fn) => fn(stage.db),
          log: log(stage.planId),
        },
        modules,
      ),
  };
}
