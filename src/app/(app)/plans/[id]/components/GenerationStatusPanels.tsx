import { GenerationAlertPanel } from './generation-alert-panel';
import {
  ExhaustedRetriesMessage,
  RetryAction,
} from './generation-retry-actions';
import { type PlanPendingViewState } from './plan-pending-view-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Loader2, RefreshCw } from 'lucide-react';

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
    <Surface variant='muted' padding='compact' className='flex flex-col gap-4'>
      <div>
        <h3 className='text-xl leading-7 font-semibold text-foreground'>
          {title}
        </h3>
        <p className='mt-2 text-sm leading-[22px] text-muted-foreground'>
          {body}
        </p>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge
          variant='outline'
          className='border-link/40 bg-action-soft text-link hover:bg-action-soft'
        >
          {badge}
        </Badge>
        <Loader2
          aria-hidden='true'
          className='size-4 animate-spin text-link motion-reduce:animate-none'
        />
      </div>
      {meta ? <p className='text-sm text-muted-foreground'>{meta}</p> : null}
    </Surface>
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
          <p className='text-sm text-muted-foreground'>
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
