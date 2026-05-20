'use client';

import { Badge } from '@/components/ui/badge';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { formatSkillLevel } from '@/features/plans/formatters';
import { clientLogger } from '@/lib/logging/client';
import type { ClientPlanDetail } from '@/shared/types/client.types';
import { Loader2 } from 'lucide-react';
import {
  ConnectionIssuePanel,
  FailurePanel,
  PendingPanel,
  ProcessingPanel,
  ReadyPanel,
  UnsupportedStatusPanel,
} from './GenerationStatusPanels';
import {
  formatOrigin,
  getStatusBadgeLabel,
  getStatusBadgeVariant,
  type PlanPendingViewState,
} from './plan-pending-view-state';

export function PlanStatusHeader({
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

export function GenerationStatusContent({
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

  clientLogger.error('Unsupported plan generation status', {
    status: viewState.status,
    viewState,
  });

  return <UnsupportedStatusPanel onRefresh={onRefresh} />;
}

export function PendingPlanDetails({ plan }: { plan: ClientPlanDetail }) {
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
