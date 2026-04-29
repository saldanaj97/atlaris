'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_ATTEMPT_CAP } from '@/features/ai/constants';
import { formatSkillLevel } from '@/features/plans/formatters';
import { usePlanGenerationSession } from '@/features/plans/session/usePlanGenerationSession';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useRetryGeneration } from '@/hooks/useRetryGeneration';
import type { ClientPlanDetail } from '@/shared/types/client.types';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Maximum retry attempts (shared constant used by both client and server)
const MAX_RETRY_ATTEMPTS = DEFAULT_ATTEMPT_CAP;

const ORIGIN_LABELS: Record<'ai' | 'manual' | 'template', string> = {
  ai: 'AI',
  manual: 'Manual',
  template: 'Template',
};

function formatOrigin(origin: ClientPlanDetail['origin']): string {
  if (!origin) return 'AI';
  return ORIGIN_LABELS[origin];
}

function getStatusBadgeVariant(
  failed: boolean,
  processing: boolean,
  retrying: boolean,
  retryInterrupted: boolean,
): 'destructive' | 'default' | 'secondary' {
  if (failed && retryInterrupted && !retrying) return 'secondary';
  if (failed && !retrying) return 'destructive';
  if (processing) return 'default';
  return 'secondary';
}

function getStatusBadgeLabel(
  status: string,
  retrying: boolean,
  retryInterrupted: boolean,
): string {
  if (retrying) return 'retrying';
  if (retryInterrupted) return 'interrupted';
  return status;
}

interface PlanPendingViewState {
  status: string;
  attempts: number;
  displayError: string | null;
  failedPlanMessage: string | null;
  hasExhaustedRetries: boolean;
  hasPollingError: boolean;
  isFailed: boolean;
  isPending: boolean;
  isProcessing: boolean;
  isRetrying: boolean;
  retryInterrupted: boolean;
}

interface PlanPendingStateProps {
  plan: ClientPlanDetail;
}

function buildPlanPendingViewState(params: {
  status: string;
  retryStatus: string;
  attempts: number;
  error: string | null;
  pollingError: string | null;
  retryError: string | null;
}): PlanPendingViewState {
  const isPending = params.status === 'pending';
  const isProcessing =
    params.status === 'processing' || params.retryStatus === 'retrying';
  const isFailed = params.status === 'failed';
  const hasPollingError = params.pollingError !== null;
  const isRetrying = params.retryStatus === 'retrying';
  const retryInterrupted = params.retryStatus === 'cancelled';
  const displayError = params.retryError ?? params.pollingError ?? params.error;
  const failedPlanMessage =
    displayError ??
    (isFailed
      ? retryInterrupted
        ? 'Generation was interrupted before it finished. You can try again.'
        : 'Generation failed before it finished. You can try again.'
      : null);

  return {
    status: params.status,
    attempts: params.attempts,
    displayError,
    failedPlanMessage,
    hasExhaustedRetries: params.attempts >= MAX_RETRY_ATTEMPTS,
    hasPollingError,
    isFailed,
    isPending,
    isProcessing,
    isRetrying,
    retryInterrupted,
  };
}

function PlanStatusHeader({
  plan,
  isPolling,
  viewState,
}: {
  plan: ClientPlanDetail;
  isPolling: boolean;
  viewState: PlanPendingViewState;
}) {
  return (
    <CardHeader className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Badge variant="default" className="uppercase">
            {formatSkillLevel(plan.skillLevel)}
          </Badge>
          <Badge
            variant={getStatusBadgeVariant(
              viewState.isFailed,
              viewState.isProcessing,
              viewState.isRetrying,
              viewState.retryInterrupted,
            )}
            className="ml-2 uppercase"
          >
            {getStatusBadgeLabel(
              viewState.status,
              viewState.isRetrying,
              viewState.retryInterrupted,
            )}
          </Badge>
        </div>
        {isPolling ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : null}
      </div>
      <CardTitle className="text-lg">Generation Status</CardTitle>
    </CardHeader>
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

function FailurePanel({
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
    <div className="space-y-4">
      <div
        className={
          isInterruptedWithoutError
            ? 'flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4'
            : 'flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4'
        }
      >
        <AlertCircle
          className={
            isInterruptedWithoutError
              ? 'mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400'
              : 'mt-0.5 h-5 w-5 shrink-0 text-destructive'
          }
        />
        <div className="space-y-1">
          <p
            className={
              isInterruptedWithoutError
                ? 'font-semibold text-amber-600 dark:text-amber-400'
                : 'font-semibold text-destructive'
            }
          >
            {isInterruptedWithoutError
              ? 'Generation interrupted'
              : 'Generation Failed'}
          </p>
          <p className="text-sm text-muted-foreground">
            {viewState.failedPlanMessage}
          </p>
          {viewState.attempts > 0 ? (
            <p className="text-sm text-muted-foreground">
              Attempt {viewState.attempts} of {MAX_RETRY_ATTEMPTS}
            </p>
          ) : null}
        </div>
      </div>

      {viewState.hasExhaustedRetries ? (
        <ExhaustedRetriesMessage />
      ) : (
        <RetryAction
          attempts={viewState.attempts}
          isRetrying={viewState.isRetrying}
          isRetryDisabled={isRetryDisabled}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}

function ConnectionIssuePanel({
  displayError,
  onRefresh,
}: {
  displayError: string;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-600 dark:text-amber-400">
            Connection Issue
          </p>
          <p className="text-sm text-muted-foreground">{displayError}</p>
        </div>
      </div>

      <Button onClick={onRefresh} className="w-full" variant="outline">
        <RefreshCw className="mr-2 h-4 w-4" />
        Refresh
      </Button>
    </div>
  );
}

function ProcessingPanel({ attempts }: { attempts: number }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
      <div className="space-y-1">
        <p className="font-semibold">Generating Your Learning Plan</p>
        <p className="text-sm text-muted-foreground">
          Our AI is crafting personalized modules and tasks tailored to your
          goals. This usually takes 5-10 seconds.
        </p>
        {attempts > 1 ? (
          <p className="text-sm text-muted-foreground">Attempt {attempts}</p>
        ) : null}
      </div>
    </div>
  );
}

function PendingPanel() {
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

function ReadyPanel() {
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

function GenerationStatusContent({
  viewState,
  isRetryDisabled,
  onRefresh,
  onRetry,
}: {
  viewState: PlanPendingViewState;
  isRetryDisabled: boolean;
  onRefresh: () => void;
  onRetry: () => void;
}) {
  if (viewState.isFailed && viewState.failedPlanMessage) {
    return (
      <FailurePanel
        viewState={viewState}
        isRetryDisabled={isRetryDisabled}
        onRetry={onRetry}
      />
    );
  }

  if (viewState.hasPollingError && viewState.displayError) {
    return (
      <ConnectionIssuePanel
        displayError={viewState.displayError}
        onRefresh={onRefresh}
      />
    );
  }

  if (viewState.isProcessing) {
    return <ProcessingPanel attempts={viewState.attempts} />;
  }

  if (viewState.isPending) {
    return <PendingPanel />;
  }

  if (viewState.status === 'ready') {
    return <ReadyPanel />;
  }

  return null;
}

function PlanDetails({ plan }: { plan: ClientPlanDetail }) {
  return (
    <div className="border-t pt-4">
      <h3 className="mb-2 font-semibold">Plan Details</h3>
      <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="font-medium">Skill Level:</span>{' '}
          {formatSkillLevel(plan.skillLevel)}
        </div>
        <div>
          <span className="font-medium">Weekly Hours:</span> {plan.weeklyHours}
        </div>
        <div>
          <span className="font-medium">Learning Style:</span>{' '}
          {plan.learningStyle}
        </div>
        <div>
          <span className="font-medium">Origin:</span>{' '}
          {formatOrigin(plan.origin)}
        </div>
      </div>
    </div>
  );
}

export function PlanPendingState({ plan }: PlanPendingStateProps) {
  const router = useRouter();
  const planGenerationSession = usePlanGenerationSession();
  const { status, attempts, error, pollingError, isPolling, revalidate } =
    usePlanStatus(plan.id, plan.status ?? 'pending');

  const {
    status: retryStatus,
    error: retryError,
    isDisabled: isRetryDisabled,
    retryGeneration,
  } = useRetryGeneration(
    plan.id,
    MAX_RETRY_ATTEMPTS,
    attempts,
    planGenerationSession,
  );

  useEffect(() => {
    if (status === 'ready') {
      router.refresh();
    }
  }, [status, router]);

  const viewState = buildPlanPendingViewState({
    status,
    retryStatus,
    attempts,
    error,
    pollingError,
    retryError,
  });

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <PlanStatusHeader
          plan={plan}
          isPolling={isPolling}
          viewState={viewState}
        />

        <CardContent className="space-y-6" aria-live="polite">
          <GenerationStatusContent
            viewState={viewState}
            isRetryDisabled={isRetryDisabled}
            onRefresh={() => void revalidate()}
            onRetry={() => void retryGeneration()}
          />

          <PlanDetails plan={plan} />
        </CardContent>
      </Card>

      <Card className="p-6 text-center text-muted-foreground">
        <p>
          Once generation is complete, your personalized learning modules and
          tasks will appear here.
        </p>
      </Card>
    </div>
  );
}
