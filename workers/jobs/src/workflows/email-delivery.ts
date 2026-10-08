import { withStepDb } from '../db';
import { parseWorkerEnv, type WorkerEnv } from '../env';
import { isJobEnabled } from '../switches';
import { resolveEmailRecipientGuard } from './email-delivery/recipient-allowlist';
import {
  type EmailDeliveryWorkflowParams,
  runEmailDeliveryWorkflow,
} from './email-delivery/run';
import { createConfiguredEmailSender } from '@/features/notifications/email/factory';
import { createLogger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/cloudflare';
import {
  type WorkflowEvent,
  WorkflowEntrypoint,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

/** Dashboard-managed; outside production it limits who may receive email. */
type EmailDeliveryEnv = WorkerEnv & { EMAIL_TEST_RECIPIENT_ALLOWLIST?: string };

const logger = createLogger({ runtime: 'cloudflare-worker' });

/**
 * Email notification delivery (B3b). Started by the Workflow `schedules`
 * (`0 14 * * *`, `30 14 * * MON`) or by `POST /v1/email-delivery/runs`.
 * `index.ts` exports it wrapped in `Sentry.instrumentWorkflowWithSentry`.
 */
export class EmailDeliveryWorkflowEntrypoint extends WorkflowEntrypoint<
  EmailDeliveryEnv,
  EmailDeliveryWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<EmailDeliveryWorkflowParams>>,
    step: WorkflowStep,
  ) {
    parseWorkerEnv(this.env);
    const env = this.env;
    return runEmailDeliveryWorkflow(event, step, {
      isEnabled: () => isJobEnabled(env, 'EMAIL_DELIVERY'),
      recipientGuard: resolveEmailRecipientGuard(env),
      withDb: (fn) => withStepDb(env.HYPERDRIVE, fn),
      createSender: createConfiguredEmailSender,
      logger,
      captureException: (error, context) => {
        Sentry.captureException(error, context);
      },
      nonRetryable: (message) => new NonRetryableError(message),
    });
  }
}
