'use client';

import type { ClientPlanDetail } from '@/shared/types/client.types';

import { GenerationStatusContent } from './GenerationStatusContent';
import { PendingPlanDetails } from './PendingPlanDetails';
import { buildPlanPendingViewState } from './plan-pending-view-state';
import { PlanStatusHeader } from './PlanStatusHeader';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { usePlanGenerationSession } from '@/features/plans/session/usePlanGenerationSession';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useRetryGeneration } from '@/hooks/useRetryGeneration';
import { clientLogger } from '@/lib/logging/client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface PlanPendingStateProps {
  plan: ClientPlanDetail;
}

export function PlanPendingState({ plan }: PlanPendingStateProps) {
  const { refresh } = useRouter();
  const planGenerationSession = usePlanGenerationSession();
  const { status, attempts, error, pollingError, isPolling, revalidate } =
    usePlanStatus(plan.id, plan.status ?? 'pending');
  const currentAttempts = plan.status === 'failed' ? plan.attempts : attempts;

  const {
    status: retryStatus,
    error: retryError,
    isDisabled: isRetryDisabled,
    retryGeneration,
  } = useRetryGeneration(
    plan.id,
    plan.attemptCap,
    currentAttempts,
    planGenerationSession,
  );

  useEffect(() => {
    if (status === 'ready') {
      refresh();
    }
  }, [status, refresh]);

  const viewState = buildPlanPendingViewState({
    status,
    retryStatus,
    attempts: currentAttempts,
    attemptCap: plan.attemptCap,
    error,
    pollingError,
    retryError,
  });

  return (
    <div className='space-y-6'>
      <Card className='gap-0 py-0'>
        <PlanStatusHeader
          plan={plan}
          isPolling={isPolling}
          viewState={viewState}
        />

        <CardContent className='space-y-6 px-6 py-6'>
          <div aria-live='polite'>
            <GenerationStatusContent
              viewState={viewState}
              isRetryDisabled={isRetryDisabled}
              onRefresh={() => {
                revalidate().catch((refreshError: unknown) => {
                  clientLogger.error('Failed to refresh plan status', {
                    error: refreshError,
                    planId: plan.id,
                  });
                });
              }}
              onRetry={() => {
                retryGeneration().catch((retryRuntimeError: unknown) => {
                  clientLogger.error('Failed to retry plan generation', {
                    error: retryRuntimeError,
                    planId: plan.id,
                  });
                });
              }}
            />
          </div>

          <PendingPlanDetails plan={plan} />
        </CardContent>
      </Card>

      <Card className='gap-4'>
        <CardDescription className='px-6 text-center'>
          Once generation is complete, your personalized learning modules and
          tasks will appear here.
        </CardDescription>
      </Card>
    </div>
  );
}
