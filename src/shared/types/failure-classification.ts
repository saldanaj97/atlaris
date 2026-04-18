import type { FailureClassification } from '@/shared/types/failure-classification.types';

const NON_RETRYABLE: Array<FailureClassification | 'unknown'> = [
  'validation',
  'capped',
];

export const isRetryableClassification = (
  classification: FailureClassification | 'unknown'
): boolean => !NON_RETRYABLE.includes(classification);
