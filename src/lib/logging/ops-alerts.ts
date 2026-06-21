import { sentryEnv } from '@/lib/config/env/observability';
import * as Sentry from '@sentry/nextjs';

/**
 * Context attached to a billing reconciliation alert.
 *
 * @property planId - Plan the failed compensation belongs to.
 * @property userId - Owner of the affected usage row.
 * @property jobId - Optional. Set when the failure is correlated with a queue job; absent when compensation fires before a job id exists (e.g. enqueue threw after reservation).
 * @property moduleId - Optional. Lesson-generation quota path.
 */
type BillingReconciliationContext = {
  planId: string;
  userId: string;
  jobId?: string;
  moduleId?: string;
};

type RegenerationWorkflowAttachUncertainContext = {
  jobId: string;
  planId: string;
  userId: string;
  workflowRunId: string;
  cancellationSucceeded: boolean;
};

export function recordRegenerationWorkflowAttachUncertain(
  context: RegenerationWorkflowAttachUncertainContext,
  error: unknown,
): void {
  Sentry.withScope((scope) => {
    scope.setTag('regeneration_workflow_attach', 'uncertain');
    scope.setExtra('jobId', context.jobId);
    scope.setExtra('planId', context.planId);
    if (sentryEnv.sendDefaultPii) {
      scope.setExtra('userId', context.userId);
    }
    scope.setExtra('workflowRunId', context.workflowRunId);
    scope.setExtra('cancellationSucceeded', context.cancellationSucceeded);
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err);
  });
}

export function recordBillingReconciliationRequired(
  context: BillingReconciliationContext,
  error: unknown,
): void {
  Sentry.withScope((scope) => {
    scope.setTag('billing_reconciliation', 'required');
    scope.setExtra('planId', context.planId);
    scope.setExtra('userId', context.userId);
    if (context.jobId !== undefined) {
      scope.setExtra('jobId', context.jobId);
    }
    if (context.moduleId !== undefined) {
      scope.setExtra('moduleId', context.moduleId);
    }
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err);
  });
}
