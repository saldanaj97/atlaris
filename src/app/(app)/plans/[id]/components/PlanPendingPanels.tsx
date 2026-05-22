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
            variant={getStatusBadgeVariant(viewState)}
            className="ml-2 uppercase"
          >
            {getStatusBadgeLabel(viewState)}
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
  switch (viewState.panelKind) {
    case 'failure':
      return (
        <FailurePanel
          viewState={viewState}
          isRetryDisabled={isRetryDisabled}
          onRetry={onRetry}
        />
      );
    case 'connection':
      return (
        <ConnectionIssuePanel
          displayError={viewState.displayError!}
          onRefresh={onRefresh}
        />
      );
    case 'processing':
      return <ProcessingPanel attempts={viewState.attempts} />;
    case 'pending':
      return <PendingPanel />;
    case 'ready':
      return <ReadyPanel />;
    case 'unsupported':
      clientLogger.error('Unsupported plan generation status', {
        status: viewState.status,
        viewState,
      });
      return <UnsupportedStatusPanel onRefresh={onRefresh} />;
  }
}

export function PendingPlanDetails({ plan }: { plan: ClientPlanDetail }) {
  return (
    <section className="border-t pt-4" aria-labelledby="plan-details-heading">
      <h3 id="plan-details-heading" className="mb-2 font-semibold">
        Plan Details
      </h3>
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
    </section>
  );
}
