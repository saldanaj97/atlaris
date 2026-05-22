import { describe, expect, it } from 'vitest';
import {
  readInternalWorkerToken,
  tokensMatch,
} from '@/lib/api/internal/internal-worker-token';

describe('readInternalWorkerToken', () => {
  it('reads Bearer header', () => {
    const request = new Request('http://x', {
      headers: { authorization: 'Bearer abc' },
    });
    expect(readInternalWorkerToken(request, 'x-maintenance-worker-token')).toBe(
      'abc',
    );
  });

  it('reads custom worker header', () => {
    const request = new Request('http://x', {
      headers: { 'x-regeneration-worker-token': 'tok' },
    });
    expect(
      readInternalWorkerToken(request, 'x-regeneration-worker-token'),
    ).toBe('tok');
  });

  it('returns null when missing', () => {
    expect(
      readInternalWorkerToken(new Request('http://x'), 'x-worker-token'),
    ).toBeNull();
  });
});

describe('tokensMatch', () => {
  it('accepts equal strings', () => {
    expect(tokensMatch('secret', 'secret')).toBe(true);
  });

  it('rejects length mismatch', () => {
    expect(tokensMatch('secret', 'sec')).toBe(false);
    expect(tokensMatch('secret', 'secrett')).toBe(false);
  });
});
