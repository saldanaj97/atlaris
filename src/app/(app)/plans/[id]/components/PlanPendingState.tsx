'use client';

import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_ATTEMPT_CAP } from '@/features/ai/constants';
import { formatSkillLevel } from '@/features/plans/formatters';
import { usePlanGenerationSession } from '@/features/plans/session/usePlanGenerationSession';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useRetryGeneration } from '@/hooks/useRetryGeneration';
import type { ClientPlanDetail } from '@/shared/types/client.types';

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

interface PlanPendingStateProps {
  plan: ClientPlanDetail;
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

  // Auto-refresh when status becomes ready
  useEffect(() => {
    if (status === 'ready') {
      router.refresh();
    }
  }, [status, router]);

  const isPending = status === 'pending';
  const isProcessing = status === 'processing' || retryStatus === 'retrying';
  // Check if plan generation has failed (we keep this block visible during retry to show progress)
  const isFailed = status === 'failed';
  // Polling gave up (non-retriable or too many consecutive failures)
  const hasPollingError = pollingError !== null;
  // Check if currently attempting a retry
  const isRetrying = retryStatus === 'retrying';
  const retryInterrupted = retryStatus === 'cancelled';

  // Use retry error if available, then polling failure, then server status error
  const displayError = retryError ?? pollingError ?? error;
  const failedPlanMessage =
    displayError ??
    (isFailed
      ? retryInterrupted
        ? 'Generation was interrupted before it finished. You can try again.'
        : 'Generation failed before it finished. You can try again.'
      : null);

  // Check if user has exhausted all retry attempts
  const hasExhaustedRetries = attempts >= MAX_RETRY_ATTEMPTS;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Badge variant="default" className="uppercase">
                {formatSkillLevel(plan.skillLevel)}
              </Badge>
              <Badge
                variant={getStatusBadgeVariant(
                  isFailed,
                  isProcessing,
                  isRetrying,
                  retryInterrupted,
                )}
                className="ml-2 uppercase"
              >
                {getStatusBadgeLabel(status, isRetrying, retryInterrupted)}
              </Badge>
            </div>
            {isPolling && (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            )}
          </div>
          <CardTitle className="text-lg">Generation Status</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6" aria-live="polite">
          {isFailed && failedPlanMessage ? (
            <div className="space-y-4">
              <div
                className={
                  retryInterrupted && !displayError
                    ? 'flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4'
                    : 'flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4'
                }
              >
                <AlertCircle
                  className={
                    retryInterrupted && !displayError
                      ? 'mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400'
                      : 'mt-0.5 h-5 w-5 shrink-0 text-destructive'
                  }
                />
                <div className="space-y-1">
                  <p
                    className={
                      retryInterrupted && !displayError
                        ? 'font-semibold text-amber-600 dark:text-amber-400'
                        : 'font-semibold text-destructive'
                    }
                  >
                    {retryInterrupted && !displayError
                      ? 'Generation interrupted'
                      : 'Generation Failed'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {failedPlanMessage}
                  </p>
                  {attempts > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Attempt {attempts} of {MAX_RETRY_ATTEMPTS}
                    </p>
                  )}
                </div>
              </div>

              {/* Retry button - only for actually failed plans */}
              {!hasExhaustedRetries ? (
                <Button
                  onClick={() => void retryGeneration()}
                  disabled={isRetryDisabled}
                  className="w-full"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Retrying…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry Generation ({MAX_RETRY_ATTEMPTS - attempts} attempts
                      remaining)
                    </>
                  )}
                </Button>
              ) : (
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
              )}
            </div>
          ) : hasPollingError && displayError ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    Connection Issue
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {displayError}
                  </p>
                </div>
              </div>

              <Button
                onClick={() => void revalidate()}
                className="w-full"
                variant="outline"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          ) : isProcessing ? (
            <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
              <div className="space-y-1">
                <p className="font-semibold">Generating Your Learning Plan</p>
                <p className="text-sm text-muted-foreground">
                  Our AI is crafting personalized modules and tasks tailored to
                  your goals. This usually takes 5-10 seconds.
                </p>
                {attempts > 1 && (
                  <p className="text-sm text-muted-foreground">
                    Attempt {attempts}
                  </p>
                )}
              </div>
            </div>
          ) : isPending ? (
            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-semibold">Queued for Generation</p>
                <p className="text-sm text-muted-foreground">
                  Your learning plan is queued and will begin generation
                  shortly.
                </p>
              </div>
            </div>
          ) : status === 'ready' ? (
            <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
              <div className="space-y-1">
                <p className="font-semibold">Loading…</p>
                <p className="text-sm text-muted-foreground">
                  Your plan is ready. Preparing the view.
                </p>
              </div>
            </div>
          ) : null}

          <div className="border-t pt-4">
            <h3 className="mb-2 font-semibold">Plan Details</h3>
            <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="font-medium">Skill Level:</span>{' '}
                {formatSkillLevel(plan.skillLevel)}
              </div>
              <div>
                <span className="font-medium">Weekly Hours:</span>{' '}
                {plan.weeklyHours}
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
