import { withInvocationDb } from '../db';
import { parseWorkerEnv, type WorkerEnv } from '../env';
import { isJobEnabled } from '../switches';
import {
  type ModuleLessonsWorkflowParams,
  runModuleLessonsWorkflow,
} from './module-lessons/run';
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
    const env = this.env;
    return runModuleLessonsWorkflow(event, step, {
      isEnabled: () => isJobEnabled(env, 'MODULE_LESSONS'),
      withDb: (fn) => withInvocationDb(env.HYPERDRIVE, this.ctx, fn),
      logger,
      nonRetryable: (message) => new NonRetryableError(message),
    });
  }
}
