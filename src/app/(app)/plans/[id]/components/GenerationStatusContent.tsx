'use client';

import type { PlanPendingViewState } from './plan-pending-view-state';

import {
  ConnectionIssuePanel,
  FailurePanel,
  PendingPanel,
  ProcessingPanel,
  ReadyPanel,
  UnsupportedStatusPanel,
} from './GenerationStatusPanels';
import { clientLogger } from '@/lib/logging/client';

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
