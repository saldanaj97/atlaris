/**
 * Ops alerting helpers. Report billing/usage reconciliation failures to Sentry
 * so they can be alerted on and paged.
 */

import * as Sentry from '@sentry/nextjs';

export interface BillingReconciliationContext {
  planId: string;
  userId: string;
  jobId: string;
}

/**
 * Records a billing reconciliation failure (e.g. rollback of usage after dedupe failed).
 * Sends the error and context to Sentry so ops can be alerted and paged.
 */
export function recordBillingReconciliationRequired(
  context: BillingReconciliationContext,
  error: unknown
): void {
  Sentry.withScope((scope) => {
    scope.setTag('billing_reconciliation', 'required');
    scope.setExtra('planId', context.planId);
    scope.setExtra('userId', context.userId);
    scope.setExtra('jobId', context.jobId);
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err);
  });
}
