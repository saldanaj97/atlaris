import * as Sentry from '@sentry/nextjs';

/**
 * Context attached to a billing reconciliation alert.
 *
 * @property planId - Plan the failed compensation belongs to.
 * @property userId - Owner of the affected usage row.
 * @property jobId - Optional. Set when the failure is correlated with a queue job; absent when compensation fires before a job id exists (e.g. enqueue threw after reservation).
 */
type BillingReconciliationContext = {
  planId: string;
  userId: string;
  jobId?: string;
};

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
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err);
  });
}
