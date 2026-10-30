import { withStepDb } from '../db';
import { parseWorkerEnv, type WorkerEnv } from '../env';
import { registerWorkerFlags } from '../flags';
import { isModuleLessonsEnabled } from '../switches';
import {
  type ModuleLessonsWorkflowParams,
  runModuleLessonsWorkflow,
} from './module-lessons/run';
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
 * Module lesson generation (B5). Started by `POST /v1/module-lessons/start`
 * or by the regeneration consumer's lesson starter. `index.ts` exports it
 * wrapped in `Sentry.instrumentWorkflowWithSentry`.
 */
export class ModuleLessonsWorkflowEntrypoint extends WorkflowEntrypoint<
  WorkerEnv,
  ModuleLessonsWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<ModuleLessonsWorkflowParams>>,
    step: WorkflowStep,
  ) {
    parseWorkerEnv(this.env);
    registerWorkerFlags(this.env);
    const env = this.env;
    return runModuleLessonsWorkflow(event, step, {
      isEnabled: isModuleLessonsEnabled,
      isGroundedEnabled,
      withDb: (fn) => withStepDb(env.HYPERDRIVE, fn),
      logger,
      nonRetryable: (message) => new NonRetryableError(message),
    });
  }
}
