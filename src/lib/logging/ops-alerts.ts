import * as Sentry from '@sentry/nextjs';

type BillingReconciliationContext = {
  planId: string;
  userId: string;
  jobId: string;
};

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
