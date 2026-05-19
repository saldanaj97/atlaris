import { DEFAULT_ATTEMPT_CAP } from '@/features/ai/constants';
import type { ClientPlanDetail } from '@/shared/types/client.types';

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

export function getStatusBadgeVariant(
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

export function getStatusBadgeLabel(
  status: string,
  retrying: boolean,
  retryInterrupted: boolean,
): string {
  if (retrying) return 'retrying';
  if (retryInterrupted) return 'interrupted';
  return status;
}

export interface PlanPendingViewState {
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

export function buildPlanPendingViewState(params: {
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
