export type PlanRegenerationWorkflowInput = {
  readonly jobId: string;
  readonly planId: string;
  readonly userId: string;
  readonly correlationId: string;
};

export type PlanRegenerationWorkflowClaimResult =
  | { readonly kind: 'claimed'; readonly runId: string }
  | { readonly kind: 'already-completed'; readonly jobId: string }
  | { readonly kind: 'already-failed'; readonly jobId: string }
  | {
      readonly kind: 'in-flight';
      readonly jobId: string;
      readonly runId: string;
    }
  | { readonly kind: 'invalid-payload'; readonly jobId: string }
  | { readonly kind: 'job-not-found'; readonly jobId: string };

export type PlanRegenerationWorkflowTerminalResult =
  | {
      readonly kind: 'completed';
      readonly jobId: string;
      readonly planId: string;
    }
  | {
      readonly kind: 'retryable-failure';
      readonly jobId: string;
      readonly planId: string;
      readonly willRetry: boolean;
    }
  | {
      readonly kind: 'permanent-failure';
      readonly jobId: string;
      readonly planId: string;
    }
  | {
      readonly kind: 'already-finalized';
      readonly jobId: string;
      readonly planId: string;
    };

export type PlanRegenerationWorkflowResult =
  | PlanRegenerationWorkflowClaimResult
  | PlanRegenerationWorkflowTerminalResult;
