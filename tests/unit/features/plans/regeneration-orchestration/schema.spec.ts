import { planRegenerationJobPayloadSchema } from '@/features/plans/regeneration-orchestration/schema';
import { describe, expect, it } from 'vitest';

const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('planRegenerationJobPayloadSchema', () => {
  it('accepts persisted error history', () => {
    expect(
      planRegenerationJobPayloadSchema.parse({
        planId,
        errorHistory: [
          {
            attempt: 1,
            error: 'transient error',
            timestamp: '2026-08-11T12:00:00.000Z',
          },
        ],
      }),
    ).toMatchObject({
      planId,
      errorHistory: [expect.objectContaining({ attempt: 1 })],
    });
  });

  it('rejects unrelated top-level payload keys', () => {
    expect(
      planRegenerationJobPayloadSchema.safeParse({
        planId,
        unrelated: true,
      }).success,
    ).toBe(false);
  });
});
