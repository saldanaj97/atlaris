import { finalizePageBoundaryResult } from '@/lib/api/page-boundary-result';
import { describe, expect, it } from 'vitest';

describe('finalizePageBoundaryResult', () => {
  it('returns boundary result when authenticated', () => {
    expect(
      finalizePageBoundaryResult('ok', {
        entityId: 'plan-1',
        unauthenticatedMessage: 'Sign in',
        unauthenticated: (message) => ({ code: 'UNAUTHORIZED', message }),
      }),
    ).toBe('ok');
  });

  it('maps null boundary result to unauthenticated error', () => {
    expect(
      finalizePageBoundaryResult(null, {
        entityId: 'plan-1',
        unauthenticatedMessage: 'Sign in required',
        unauthenticated: (message) => ({
          code: 'UNAUTHORIZED',
          message,
        }),
      }),
    ).toEqual({ code: 'UNAUTHORIZED', message: 'Sign in required' });
  });
});
