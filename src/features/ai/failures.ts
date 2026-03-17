import type { FailureClassification } from '@/types/client.types';

const NON_RETRYABLE: Array<FailureClassification | 'unknown'> = [
  'validation',
  'capped',
];

export const isRetryableClassification = (
  classification: FailureClassification | 'unknown'
): boolean => !NON_RETRYABLE.includes(classification);
