import {
  buildPersistedRegenerationInput,
  rawRegenerationOverridesHaveImmutableFields,
  resolveRegenerationPolicyDenial,
} from '@/features/plans/regeneration-orchestration/admission';
import { describe, expect, it } from 'vitest';

const plan = {
  id: 'plan-1',
  userId: 'user-1',
  topic: 'rust',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
  startDate: '2026-01-01',
  deadlineDate: '2026-01-15',
};

describe('resolveRegenerationPolicyDenial', () => {
  it('returns not-included for Free even when duration also exceeds', () => {
    expect(
      resolveRegenerationPolicyDenial({
        tier: 'free',
        weeklyHours: 5,
        startDate: '2026-01-01',
        deadlineDate: '2026-06-01',
      }),
    ).toEqual({ kind: 'not-included' });
  });

  it('returns duration-exceeded for Starter over 8 weeks', () => {
    const denial = resolveRegenerationPolicyDenial({
      tier: 'starter',
      weeklyHours: 5,
      startDate: '2026-01-01',
      deadlineDate: '2026-04-01',
    });
    expect(denial?.kind).toBe('duration-exceeded');
  });

  it('allows Pro unlimited duration', () => {
    expect(
      resolveRegenerationPolicyDenial({
        tier: 'pro',
        weeklyHours: 5,
        startDate: '2026-01-01',
        deadlineDate: '2027-01-01',
      }),
    ).toBeNull();
  });

  it('allows Starter when merged dates fit within 8 weeks', () => {
    expect(
      resolveRegenerationPolicyDenial({
        tier: 'starter',
        weeklyHours: 5,
        startDate: '2026-01-01',
        deadlineDate: '2026-02-12',
      }),
    ).toBeNull();
  });
});

describe('buildPersistedRegenerationInput', () => {
  it('always rebuilds topic from the stored plan', () => {
    expect(
      buildPersistedRegenerationInput(plan, {
        skillLevel: 'advanced',
      }),
    ).toMatchObject({
      topic: 'rust',
      skillLevel: 'advanced',
      notes: undefined,
    });
  });

  it('applies allowed date overrides without clamping', () => {
    expect(
      buildPersistedRegenerationInput(
        { ...plan, deadlineDate: '2026-06-01' },
        { deadlineDate: '2026-02-12' },
      ),
    ).toMatchObject({
      topic: 'rust',
      startDate: '2026-01-01',
      deadlineDate: '2026-02-12',
    });
  });
});

describe('rawRegenerationOverridesHaveImmutableFields', () => {
  it('detects forged topic or notes on a legacy payload', () => {
    expect(
      rawRegenerationOverridesHaveImmutableFields({
        planId: plan.id,
        overrides: { topic: 'forged' },
      }),
    ).toBe(true);
    expect(
      rawRegenerationOverridesHaveImmutableFields({
        planId: plan.id,
        overrides: { skillLevel: 'advanced' },
      }),
    ).toBe(false);
  });
});
