import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GenerationAlertPanel } from './generation-alert-panel';
import {
  ExhaustedRetriesMessage,
  RetryAction,
} from './generation-retry-actions';
import {
  MAX_RETRY_ATTEMPTS,
  type PlanPendingViewState,
} from './plan-pending-view-state';

export function FailurePanel({
  viewState,
  isRetryDisabled,
  onRetry,
}: {
  viewState: PlanPendingViewState;
  isRetryDisabled: boolean;
  onRetry: () => void;
}) {
  const isInterruptedWithoutError =
    viewState.retryInterrupted && !viewState.displayError;

  return (
    <GenerationAlertPanel
      variant={isInterruptedWithoutError ? 'warning' : 'destructive'}
      title={
        isInterruptedWithoutError
          ? 'Generation interrupted'
          : 'Generation Failed'
      }
      body={viewState.failedPlanMessage}
      meta={
        viewState.attempts > 0 ? (
          <p className="text-sm text-muted-foreground">
            Attempt {viewState.attempts} of {MAX_RETRY_ATTEMPTS}
          </p>
        ) : null
      }
      footer={
        viewState.hasExhaustedRetries ? (
          <ExhaustedRetriesMessage />
        ) : (
          <RetryAction
            attempts={viewState.attempts}
            isRetrying={viewState.isRetrying}
            isRetryDisabled={isRetryDisabled}
            onRetry={onRetry}
          />
        )
      }
    />
  );
}

export function ConnectionIssuePanel({
  displayError,
  onRefresh,
}: {
  displayError: string;
  onRefresh: () => void;
}) {
  return (
    <GenerationAlertPanel
      variant="warning"
      title="Connection Issue"
      body={displayError}
      footer={
        <Button onClick={onRefresh} className="w-full" variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      }
    />
  );
}

export function ProcessingPanel({ attempts }: { attempts: number }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
      <div className="space-y-1">
        <p className="font-semibold">Generating Your Learning Plan</p>
        <p className="text-sm text-muted-foreground">
          Our AI is crafting personalized modules and tasks tailored to your
          goals. This may take a moment.
        </p>
        {attempts > 1 ? (
          <p className="text-sm text-muted-foreground">
            Attempt {attempts} of {MAX_RETRY_ATTEMPTS}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function PendingPanel() {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-semibold">Queued for Generation</p>
        <p className="text-sm text-muted-foreground">
          Your learning plan is queued and will begin generation shortly.
        </p>
      </div>
    </div>
  );
}

export function ReadyPanel() {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
      <div className="space-y-1">
        <p className="font-semibold">Loading…</p>
        <p className="text-sm text-muted-foreground">
          Your plan is ready. Preparing the view.
        </p>
      </div>
    </div>
  );
}

export function UnsupportedStatusPanel({
  onRefresh,
}: {
  onRefresh: () => void;
}) {
  return (
    <GenerationAlertPanel
      variant="warning"
      title="Unknown Generation Status"
      body="This plan reported an unsupported status. Refresh to check for the latest state."
      footer={
        <Button onClick={onRefresh} className="w-full" variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      }
    />
  );
}
