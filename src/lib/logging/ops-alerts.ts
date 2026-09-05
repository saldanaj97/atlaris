import { sentryEnv } from '@/lib/config/env/observability';
import * as Sentry from '@sentry/nextjs';

type RegenerationWorkflowAttachUncertainContext = {
  jobId: string;
  planId: string;
  userId: string;
  correlationId?: string;
  workflowRunId?: string;
  cancellationSucceeded?: boolean;
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
    if (context.correlationId !== undefined) {
      scope.setExtra('correlationId', context.correlationId);
    }
    if (context.workflowRunId !== undefined) {
      scope.setExtra('workflowRunId', context.workflowRunId);
    }
    if (context.cancellationSucceeded !== undefined) {
      scope.setExtra('cancellationSucceeded', context.cancellationSucceeded);
    }
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err);
  });
}
