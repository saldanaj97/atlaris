import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  MAX_RETRY_ATTEMPTS,
  type PlanPendingViewState,
} from './plan-pending-view-state';

const ALERT_VARIANT_CLASSES = {
  warning: {
    container:
      'flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4',
    icon: 'mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400',
    title: 'font-semibold text-amber-600 dark:text-amber-400',
  },
  destructive: {
    container:
      'flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4',
    icon: 'mt-0.5 h-5 w-5 shrink-0 text-destructive',
    title: 'font-semibold text-destructive',
  },
} as const;

function GenerationAlertPanel({
  variant,
  title,
  body,
  meta,
  footer,
}: {
  variant: 'destructive' | 'warning';
  title: string;
  body: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
}) {
  const classes = ALERT_VARIANT_CLASSES[variant];

  return (
    <div className={footer ? 'space-y-4' : undefined}>
      <div className={classes.container}>
        <AlertCircle className={classes.icon} />
        <div className="space-y-1">
          <p className={classes.title}>{title}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
          {meta}
        </div>
      </div>
      {footer}
    </div>
  );
}

function RetryAction({
  attempts,
  isRetrying,
  isRetryDisabled,
  onRetry,
}: {
  attempts: number;
  isRetrying: boolean;
  isRetryDisabled: boolean;
  onRetry: () => void;
}) {
  return (
    <Button onClick={onRetry} disabled={isRetryDisabled} className="w-full">
      {isRetrying ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Retrying…
        </>
      ) : (
        <>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry Generation ({MAX_RETRY_ATTEMPTS - attempts} attempts remaining)
        </>
      )}
    </Button>
  );
}

function ExhaustedRetriesMessage() {
  return (
    <div className="rounded-lg bg-muted p-4 text-center">
      <p className="text-sm text-muted-foreground">
        Maximum retry attempts reached. Please{' '}
        <Link
          href="/plans/new"
          className="rounded-sm text-primary underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          create a new plan
        </Link>{' '}
        to try again.
      </p>
    </div>
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
        {attempts > 0 ? (
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
