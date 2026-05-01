import { describe, expect, it } from 'vitest';
import {
  readWorkerToken,
  tokensMatch,
} from '@/lib/api/internal/regeneration-worker-token';

describe('readWorkerToken', () => {
  it('reads Bearer header', () => {
    const r = new Request('http://x', {
      headers: { authorization: 'Bearer abc' },
    });
    expect(readWorkerToken(r)).toBe('abc');
  });

  it('reads x-regeneration-worker-token', () => {
    const r = new Request('http://x', {
      headers: { 'x-regeneration-worker-token': 'tok' },
    });
    expect(readWorkerToken(r)).toBe('tok');
  });

  it('returns null when missing', () => {
    expect(readWorkerToken(new Request('http://x'))).toBeNull();
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
