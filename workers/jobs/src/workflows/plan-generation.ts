import { withStepDb } from '../db';
import { parseWorkerEnv, type WorkerEnv } from '../env';
import { registerWorkerFlags } from '../flags';
import { createWorkflowModuleLessonStarter } from '../jobs/regeneration-consumer';
import {
  isDirectResearchEnabled,
  isJobsPaused,
  isModuleLessonsEnabled,
} from '../switches';
import {
  type PlanGenerationWorkflowParams,
  runPlanGenerationWorkflow,
} from './plan-generation/run';
import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import { createLogger } from '@/lib/logging/logger';
import {
  type WorkflowEvent,
  WorkflowEntrypoint,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

const logger = createLogger({ runtime: 'cloudflare-worker' });

/**
 * Plan create/retry generation (B6). Started by
 * `POST /v1/plan-generation/start` after the app reserves the attempt.
 * `index.ts` exports it wrapped in `Sentry.instrumentWorkflowWithSentry`.
 */
export class PlanGenerationWorkflowEntrypoint extends WorkflowEntrypoint<
  WorkerEnv,
  PlanGenerationWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<PlanGenerationWorkflowParams>>,
    step: WorkflowStep,
  ) {
    parseWorkerEnv(this.env);
    registerWorkerFlags(this.env);
    const env = this.env;
    return runPlanGenerationWorkflow(event, step, {
      isEnabled: async () => !(await isJobsPaused()),
      isGroundedEnabled,
      isDirectResearchEnabled,
      withDb: (fn) => withStepDb(env.HYPERDRIVE, fn),
      // Lessons for the first modules start through the lessons Workflow.
      startModuleLessons: createWorkflowModuleLessonStarter({
        workflow: env.MODULE_LESSONS_WORKFLOW,
        isEnabled: isModuleLessonsEnabled,
        logger,
      }),
      logger,
      nonRetryable: (message) => new NonRetryableError(message),
    });
  }
}
