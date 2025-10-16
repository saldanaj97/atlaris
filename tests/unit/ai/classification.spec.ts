import { describe, expect, it } from 'vitest';

import { classifyFailure } from '@/lib/ai/classification';
import { ParserError } from '@/lib/ai/parser';
import {
  ProviderError,
  ProviderRateLimitError,
  ProviderTimeoutError,
} from '@/lib/ai/provider';

describe('Failure classification', () => {
  it('returns timeout classification when timedOut flag is set', () => {
    expect(
      classifyFailure({ error: new Error('timed out'), timedOut: true })
    ).toBe('timeout');
  });

  it('returns timeout classification for ProviderTimeoutError', () => {
    expect(classifyFailure({ error: new ProviderTimeoutError() })).toBe(
      'timeout'
    );
  });

  it('returns rate_limit classification for ProviderRateLimitError', () => {
    expect(classifyFailure({ error: new ProviderRateLimitError() })).toBe(
      'rate_limit'
    );
  });

  it('returns validation classification for parser validation errors', () => {
    expect(
      classifyFailure({
        error: new ParserError('validation', 'Zero modules detected'),
      })
    ).toBe('validation');
  });

  it('returns provider_error classification for parser invalid_json errors', () => {
    expect(
      classifyFailure({
        error: new ParserError('invalid_json', 'Bad JSON received'),
      })
    ).toBe('provider_error');
  });

  it('returns forced classification when provided', () => {
    expect(
      classifyFailure({
        error: new Error('capped'),
        forcedClassification: 'capped',
      })
    ).toBe('capped');
  });

  it('returns provider_error for unknown errors', () => {
    expect(classifyFailure({ error: new Error('unknown') })).toBe(
      'provider_error'
    );
    expect(
      classifyFailure({ error: new ProviderError('unknown', 'err') })
    ).toBe('provider_error');
  });
});
