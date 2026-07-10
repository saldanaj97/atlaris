/**
 * Workflow SDK `'use workflow'` entrypoints require static step imports; keep
 * the dependency-injected factory available for deterministic unit tests.
 */
import type {
  EmailNotificationDeliveryWorkflowClaimResult,
  EmailNotificationDeliveryWorkflowInput,
  EmailNotificationDeliveryWorkflowPageResult,
  EmailNotificationDeliveryWorkflowResult,
  EmailNotificationDeliveryWorkflowTerminalResult,
} from './email-notification-delivery.types';

import {
  claimEmailNotificationDeliveryRunStep,
  finalizeEmailNotificationDeliveryRunStep,
  processEmailNotificationDeliveryPageStep,
} from './email-notification-delivery.steps';

export type EmailNotificationDeliveryWorkflowDeps = {
  readonly claim: (
    input: EmailNotificationDeliveryWorkflowInput,
  ) => Promise<EmailNotificationDeliveryWorkflowClaimResult>;
  readonly processPage: (
    input: EmailNotificationDeliveryWorkflowInput,
  ) => Promise<EmailNotificationDeliveryWorkflowPageResult>;
  readonly finalize: (
    input: EmailNotificationDeliveryWorkflowInput,
  ) => Promise<EmailNotificationDeliveryWorkflowTerminalResult>;
};

export function createEmailNotificationDeliveryWorkflow(
  deps: EmailNotificationDeliveryWorkflowDeps,
): (
  input: EmailNotificationDeliveryWorkflowInput,
) => Promise<EmailNotificationDeliveryWorkflowResult> {
  return async function runEmailNotificationDeliveryWorkflow(
    input: EmailNotificationDeliveryWorkflowInput,
  ): Promise<EmailNotificationDeliveryWorkflowResult> {
    const claim = await deps.claim(input);
    if (claim.kind !== 'claimed') {
      return claim;
    }

    for (;;) {
      const page = await deps.processPage(input);
      if (page.kind !== 'page_processed') {
        return page;
      }
      if (page.nextCursor === null) {
        return deps.finalize(input);
      }
    }
  };
}

const runEmailNotificationDeliveryWorkflow =
  createEmailNotificationDeliveryWorkflow({
    claim: claimEmailNotificationDeliveryRunStep,
    processPage: processEmailNotificationDeliveryPageStep,
    finalize: finalizeEmailNotificationDeliveryRunStep,
  });

export async function emailNotificationDeliveryWorkflow(
  input: EmailNotificationDeliveryWorkflowInput,
): Promise<EmailNotificationDeliveryWorkflowResult> {
  'use workflow';

  return runEmailNotificationDeliveryWorkflow(input);
}
