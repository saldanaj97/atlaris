'use client';

import { Card, CardContent } from '@/components/ui/card';
import { usePlanGenerationSession } from '@/features/plans/session/usePlanGenerationSession';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useRetryGeneration } from '@/hooks/useRetryGeneration';
import { clientLogger } from '@/lib/logging/client';
import type { ClientPlanDetail } from '@/shared/types/client.types';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  GenerationStatusContent,
  PendingPlanDetails,
  PlanStatusHeader,
} from './PlanPendingPanels';
import {
  buildPlanPendingViewState,
  MAX_RETRY_ATTEMPTS,
} from './plan-pending-view-state';

interface PlanPendingStateProps {
  plan: ClientPlanDetail;
}

export function PlanPendingState({ plan }: PlanPendingStateProps) {
  const { refresh } = useRouter();
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
      refresh();
    }
  }, [status, refresh]);

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
      <Card>
        <PlanStatusHeader
          plan={plan}
          isPolling={isPolling}
          viewState={viewState}
        />

        <CardContent className="space-y-6" aria-live="polite">
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

          <PendingPlanDetails plan={plan} />
        </CardContent>
      </Card>

      <Card className="text-center text-muted-foreground">
        <CardContent>
          <p>
            Once generation is complete, your personalized learning modules and
            tasks will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
