import {
  FAILURE_CLASSIFICATIONS,
  type FailureClassification,
} from '@/shared/types/failure-classification.types';

const FAILURE_CLASSIFICATION_SET: ReadonlySet<string> = new Set(
  FAILURE_CLASSIFICATIONS,
);

export function isKnownFailureClassification(
  classification: string,
): classification is FailureClassification {
  return FAILURE_CLASSIFICATION_SET.has(classification);
}

const NON_RETRYABLE: Array<FailureClassification | 'unknown'> = [
  'validation',
  'capped',
];

export const isRetryableClassification = (
  classification: FailureClassification | 'unknown',
): boolean => !NON_RETRYABLE.includes(classification);
