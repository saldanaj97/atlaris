'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useRetryGeneration } from '@/hooks/useRetryGeneration';
import { DEFAULT_ATTEMPT_CAP } from '@/lib/ai/constants';
import { formatSkillLevel } from '@/lib/formatters';
import type { ClientPlanDetail } from '@/lib/types/client';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Maximum attempts allowed for retry (imported from shared constants, must match server-side ATTEMPT_CAP)
const MAX_RETRY_ATTEMPTS = DEFAULT_ATTEMPT_CAP;

interface PlanPendingStateProps {
  plan: ClientPlanDetail;
}

export function PlanPendingState({ plan }: PlanPendingStateProps) {
  const router = useRouter();
  const { status, attempts, error, isPolling } = usePlanStatus(
    plan.id,
    plan.status ?? 'pending'
  );

  const {
    status: retryStatus,
    error: retryError,
    isDisabled: isRetryDisabled,
    retryGeneration,
  } = useRetryGeneration(plan.id, MAX_RETRY_ATTEMPTS, attempts);

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
  // Check if currently attempting a retry
  const isRetrying = retryStatus === 'retrying';

  // Use retry error if available, otherwise use status error
  const displayError = retryError ?? error;

  // Check if user has exhausted all retry attempts
  const hasExhaustedRetries = attempts >= MAX_RETRY_ATTEMPTS;

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Badge variant="neutral" className="uppercase">
                {formatSkillLevel(plan.skillLevel)}
              </Badge>
              <Badge
                variant={
                  isFailed ? 'default' : isProcessing ? 'default' : 'neutral'
                }
                className="ml-2 uppercase"
              >
                {status}
              </Badge>
            </div>
            {isPolling && (
              <Loader2 className="text-primary h-6 w-6 animate-spin" />
            )}
          </div>
          <CardTitle className="text-3xl font-bold">{plan.topic}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {isFailed && displayError ? (
            <div className="space-y-4">
              <div className="bg-destructive/10 border-destructive/20 flex items-start gap-3 rounded-lg border p-4">
                <AlertCircle className="text-destructive mt-0.5 h-5 w-5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-destructive font-semibold">
                    Generation Failed
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {displayError}
                  </p>
                  {attempts > 0 && (
                    <p className="text-muted-foreground text-sm">
                      Attempt {attempts} of {MAX_RETRY_ATTEMPTS}
                    </p>
                  )}
                </div>
              </div>

              {/* Retry button */}
              {!hasExhaustedRetries ? (
                <Button
                  onClick={() => void retryGeneration()}
                  disabled={isRetryDisabled}
                  className="w-full"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Retrying...
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
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-muted-foreground text-sm">
                    Maximum retry attempts reached. Please{' '}
                    <Link href="/plans/new" className="text-primary underline">
                      create a new plan
                    </Link>{' '}
                    to try again.
                  </p>
                </div>
              )}
            </div>
          ) : isProcessing ? (
            <div className="bg-primary/5 flex items-start gap-3 rounded-lg p-4">
              <Loader2 className="text-primary mt-0.5 h-5 w-5 flex-shrink-0 animate-spin" />
              <div className="space-y-1">
                <p className="font-semibold">Generating Your Learning Plan</p>
                <p className="text-muted-foreground text-sm">
                  Our AI is crafting personalized modules and tasks tailored to
                  your goals. This usually takes 5-10 seconds.
                </p>
                {attempts > 1 && (
                  <p className="text-muted-foreground text-sm">
                    Attempt {attempts}
                  </p>
                )}
              </div>
            </div>
          ) : isPending ? (
            <div className="bg-muted/50 flex items-start gap-3 rounded-lg p-4">
              <Loader2 className="text-muted-foreground mt-0.5 h-5 w-5 flex-shrink-0 animate-spin" />
              <div className="space-y-1">
                <p className="font-semibold">Queued for Generation</p>
                <p className="text-muted-foreground text-sm">
                  Your learning plan is queued and will begin generation
                  shortly.
                </p>
                {attempts > 0 && (
                  <p className="text-muted-foreground text-sm">
                    Position in queue: processing
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <div className="border-t pt-4">
            <h3 className="mb-2 font-semibold">Plan Details</h3>
            <div className="text-muted-foreground grid grid-cols-2 gap-2 text-sm">
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
                <span className="font-medium">Origin:</span> {plan.origin}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="text-muted-foreground p-6 text-center">
        <p>
          Once generation is complete, your personalized learning modules and
          tasks will appear here.
        </p>
      </Card>
    </div>
  );
}
