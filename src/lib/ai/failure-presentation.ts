import type { FailureClassification } from '@/lib/types/client';

export type FailurePresentationClassification =
  | FailureClassification
  | 'unknown';

export interface FailurePresentation {
  code: string;
  message: string;
  retryable: boolean;
}

const DEFAULT_FAILURE_PRESENTATION: FailurePresentation = {
  code: 'GENERATION_FAILED',
  message: 'An unexpected error occurred during plan generation.',
  retryable: false,
};

const FAILURE_PRESENTATIONS: Record<
  FailurePresentationClassification,
  FailurePresentation
> = {
  timeout: {
    code: 'GENERATION_TIMEOUT',
    message: 'Plan generation timed out. Please try again.',
    retryable: true,
  },
  rate_limit: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please wait a moment and try again.',
    retryable: true,
  },
  provider_error: {
    code: 'GENERATION_FAILED',
    message: 'Plan generation encountered an error. Please try again.',
    retryable: true,
  },
  validation: {
    code: 'INVALID_OUTPUT',
    message:
      'Plan generation produced invalid output. Please try with different parameters.',
    retryable: false,
  },
  capped: {
    code: 'ATTEMPTS_EXHAUSTED',
    message: 'Maximum generation attempts reached. Please create a new plan.',
    retryable: false,
  },
  in_progress: {
    code: 'GENERATION_IN_PROGRESS',
    message:
      'A generation is already in progress for this plan. Please wait and try again.',
    retryable: true,
  },
  unknown: DEFAULT_FAILURE_PRESENTATION,
};

export function getFailurePresentation(
  classification: FailurePresentationClassification
): FailurePresentation {
  return FAILURE_PRESENTATIONS[classification] ?? DEFAULT_FAILURE_PRESENTATION;
}

export function classificationToUserMessage(
  classification: FailurePresentationClassification
): string {
  return getFailurePresentation(classification).message;
}
