import type { ClientPlanDetail, PlanStatus } from '@/shared/types/client.types';

import { DEFAULT_ATTEMPT_CAP } from '@/features/ai/constants';
import { PLAN_STATUSES } from '@/shared/types/client';

export const MAX_RETRY_ATTEMPTS = DEFAULT_ATTEMPT_CAP;

const ORIGIN_LABELS: Record<'ai' | 'manual' | 'template', string> = {
  ai: 'AI',
  manual: 'Manual',
  template: 'Template',
};

export function formatOrigin(origin: ClientPlanDetail['origin']): string {
  if (!origin) return 'AI';
  return ORIGIN_LABELS[origin];
}

export type PlanPendingPanelKind =
  | 'failure'
  | 'connection'
  | 'processing'
  | 'pending'
  | 'ready'
  | 'unsupported';

export interface PlanPendingViewState {
  /** Known plan status, or the raw hook value when `panelKind` is `unsupported`. */
  status: PlanStatus | string;
  panelKind: PlanPendingPanelKind;
  attempts: number;
  displayError: string | null;
  failedPlanMessage: string | null;
  hasExhaustedRetries: boolean;
  isRetrying: boolean;
  retryInterrupted: boolean;
}

export function getStatusBadgeVariant(
  viewState: PlanPendingViewState,
): 'destructive' | 'default' | 'secondary' {
  const { panelKind, isRetrying, retryInterrupted } = viewState;
  if (panelKind === 'failure' && retryInterrupted && !isRetrying) {
    return 'secondary';
  }
  if (panelKind === 'failure' && !isRetrying) return 'destructive';
  if (panelKind === 'processing' || isRetrying) return 'default';
  return 'secondary';
}

export function getStatusBadgeLabel(viewState: PlanPendingViewState): string {
  if (viewState.isRetrying) return 'retrying';
  if (viewState.retryInterrupted) return 'interrupted';
  return viewState.status;
}

function parsePlanStatus(status: string): PlanStatus | null {
  return (PLAN_STATUSES as readonly string[]).includes(status)
    ? (status as PlanStatus)
    : null;
}

function computePanelKind(params: {
  parsedStatus: PlanStatus | null;
  failedPlanMessage: string | null;
  pollingError: string | null;
  displayError: string | null;
  retryStatus: string;
}): PlanPendingPanelKind {
  const isFailed = params.parsedStatus === 'failed';
  const isPending = params.parsedStatus === 'pending';
  const isProcessing =
    params.parsedStatus === 'processing' || params.retryStatus === 'retrying';

  if (isFailed && params.failedPlanMessage) return 'failure';
  if (params.pollingError !== null && params.displayError) return 'connection';
  if (isProcessing) return 'processing';
  if (isPending) return 'pending';
  if (params.parsedStatus === 'ready') return 'ready';
  return 'unsupported';
}

export function buildPlanPendingViewState(params: {
  status: string;
  retryStatus: string;
  attempts: number;
  error: string | null;
  pollingError: string | null;
  retryError: string | null;
}): PlanPendingViewState {
  const parsedStatus = parsePlanStatus(params.status);
  const status = parsedStatus ?? params.status;
  const isFailed = parsedStatus === 'failed';
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

  const panelKind = computePanelKind({
    parsedStatus,
    failedPlanMessage,
    pollingError: params.pollingError,
    displayError,
    retryStatus: params.retryStatus,
  });

  return {
    status,
    panelKind,
    attempts: params.attempts,
    displayError,
    failedPlanMessage,
    hasExhaustedRetries: params.attempts >= MAX_RETRY_ATTEMPTS,
    isRetrying,
    retryInterrupted,
  };
}
