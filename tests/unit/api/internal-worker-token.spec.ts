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

  it('reads Bearer header case-insensitively with flexible whitespace', () => {
    const request = new Request('http://x', {
      headers: { authorization: 'bearer   abc-def' },
    });
    expect(readInternalWorkerToken(request, 'x-worker-token')).toBe('abc-def');
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

  it('returns null when headerName is empty', () => {
    const request = new Request('http://x', {
      headers: { authorization: 'Bearer abc' },
    });
    expect(readInternalWorkerToken(request, '')).toBeNull();
    expect(readInternalWorkerToken(request, '   ')).toBeNull();
  });

  it('returns null when both Bearer and custom header are present', () => {
    const request = new Request('http://x', {
      headers: {
        authorization: 'Bearer bearer-token',
        'x-worker-token': 'custom-token',
      },
    });
    expect(readInternalWorkerToken(request, 'x-worker-token')).toBeNull();
  });

  it('falls back to custom header when authorization is not Bearer', () => {
    const request = new Request('http://x', {
      headers: {
        authorization: 'Basic abc',
        'x-worker-token': 'custom-token',
      },
    });
    expect(readInternalWorkerToken(request, 'x-worker-token')).toBe(
      'custom-token',
    );
  });

  it('returns null for malformed Bearer header without token value', () => {
    const request = new Request('http://x', {
      headers: { authorization: 'Bearer' },
    });
    expect(readInternalWorkerToken(request, 'x-worker-token')).toBeNull();
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
