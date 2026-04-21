import { DEFAULT_CLASSIFICATION } from '@/features/ai/constants';
import { ParserError } from '@/features/ai/parser';
import {
  ProviderError,
  ProviderRateLimitError,
  ProviderTimeoutError,
} from '@/features/ai/providers/errors';

import type { FailureClassification } from '@/shared/types/client.types';

type ClassificationContext = {
  error: unknown;
  timedOut?: boolean;
  forcedClassification?: FailureClassification;
};

export function classifyFailure({
  error,
  timedOut,
  forcedClassification,
}: ClassificationContext): FailureClassification {
  if (forcedClassification) {
    return forcedClassification;
  }

  if (timedOut || error instanceof ProviderTimeoutError) {
    return 'timeout';
  }

  if (error instanceof ProviderRateLimitError) {
    return 'rate_limit';
  }

  if (error instanceof ParserError) {
    if (error.kind === 'validation') {
      return 'validation';
    }
    return DEFAULT_CLASSIFICATION;
  }

  if (error instanceof ProviderError) {
    if (error.kind === 'rate_limit') {
      return 'rate_limit';
    }
    if (error.kind === 'timeout') {
      return 'timeout';
    }
    return DEFAULT_CLASSIFICATION;
  }

  return DEFAULT_CLASSIFICATION;
}
