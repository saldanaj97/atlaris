import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@/features/notifications/email/unsubscribe-token';
import { describe, expect, it } from 'vitest';

describe('unsubscribe token', () => {
  const secret = 'test-unsubscribe-secret';

  it('round-trips a valid token', () => {
    const token = createUnsubscribeToken({
      userId: '11111111-1111-1111-1111-111111111111',
      secret,
      nowMs: Date.parse('2026-07-09T00:00:00.000Z'),
    });
    const payload = verifyUnsubscribeToken({
      token,
      secret,
      nowMs: Date.parse('2026-07-09T00:00:00.000Z'),
    });
    expect(payload?.userId).toBe('11111111-1111-1111-1111-111111111111');
    expect(payload?.purpose).toBe('email_unsubscribe_all');
  });

  it('rejects tampered signatures', () => {
    const token = createUnsubscribeToken({
      userId: '11111111-1111-1111-1111-111111111111',
      secret,
    });
    const [body] = token.split('.');
    expect(
      verifyUnsubscribeToken({
        token: `${body}.tampered`,
        secret,
      }),
    ).toBeNull();
  });

  it('rejects expired tokens', () => {
    const token = createUnsubscribeToken({
      userId: '11111111-1111-1111-1111-111111111111',
      secret,
      nowMs: Date.parse('2026-01-01T00:00:00.000Z'),
      ttlMs: 1000,
    });
    expect(
      verifyUnsubscribeToken({
        token,
        secret,
        nowMs: Date.parse('2026-01-01T00:00:02.000Z'),
      }),
    ).toBeNull();
  });

  it('rejects wrong secret', () => {
    const token = createUnsubscribeToken({
      userId: '11111111-1111-1111-1111-111111111111',
      secret,
    });
    expect(verifyUnsubscribeToken({ token, secret: 'other' })).toBeNull();
  });
});
