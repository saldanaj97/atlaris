import type { FailureClassification } from '@/lib/types/client';

import { ParserError } from './parser';
import {
  ProviderError,
  ProviderRateLimitError,
  ProviderTimeoutError,
} from './provider';

export interface ClassificationContext {
  error: unknown;
  timedOut?: boolean;
  forcedClassification?: FailureClassification;
}

const DEFAULT_CLASSIFICATION: FailureClassification = 'provider_error';

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
