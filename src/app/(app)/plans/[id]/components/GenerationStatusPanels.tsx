import { GenerationAlertPanel } from './generation-alert-panel';
import {
  ExhaustedRetriesMessage,
  RetryAction,
} from './generation-retry-actions';
import { type PlanPendingViewState } from './plan-pending-view-state';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

function WaitingStatusPanel({
  title,
  body,
  badge,
  meta,
}: {
  title: string;
  body: string;
  badge: string;
  meta?: string;
}) {
  return (
    <GenerationAlertPanel
      variant='info'
      title={title}
      body={body}
      badge={badge}
      busy
      meta={
        meta ? <p className='type-body text-muted-foreground'>{meta}</p> : null
      }
    />
  );
}

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
      badge={isInterruptedWithoutError ? undefined : 'Failed'}
      meta={
        viewState.attempts > 0 ? (
          <p className='type-body text-muted-foreground'>
            Attempt {viewState.attempts} of {viewState.attemptCap}
          </p>
        ) : null
      }
      footer={
        viewState.hasExhaustedRetries ? (
          <ExhaustedRetriesMessage />
        ) : (
          <RetryAction
            attempts={viewState.attempts}
            attemptCap={viewState.attemptCap}
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
      variant='warning'
      title='Connection Issue'
      body={displayError}
      badge='Check again'
      footer={
        <Button onClick={onRefresh} className='w-full' variant='outline'>
          <RefreshCw className='size-4' />
          Refresh
        </Button>
      }
    />
  );
}

export function ProcessingPanel({
  attempts,
  attemptCap,
}: {
  attempts: number;
  attemptCap: number;
}) {
  return (
    <WaitingStatusPanel
      title='Generating Your Learning Plan'
      body='Our AI is crafting personalized modules and tasks tailored to your goals.'
      badge='Generating'
      meta={attempts > 1 ? `Attempt ${attempts} of ${attemptCap}` : undefined}
    />
  );
}

export function PendingPanel() {
  return (
    <WaitingStatusPanel
      title='Queued for Generation'
      body='Your learning plan is queued and will begin generation shortly.'
      badge='Preparing'
    />
  );
}

export function ReadyPanel() {
  return (
    <WaitingStatusPanel
      title='Loading…'
      body='Your plan is ready. Preparing the view.'
      badge='Ready'
    />
  );
}

export function UnsupportedStatusPanel({
  onRefresh,
}: {
  onRefresh: () => void;
}) {
  return (
    <GenerationAlertPanel
      variant='warning'
      title='Unknown Generation Status'
      body='This plan reported an unsupported status. Refresh to check for the latest state.'
      badge='Unknown'
      footer={
        <Button onClick={onRefresh} className='w-full' variant='outline'>
          <RefreshCw className='size-4' />
          Refresh
        </Button>
      }
    />
  );
}
