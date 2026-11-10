import { evaluateGenerationAdmission } from '@/shared/policy/generation-admission';
import { describe, expect, it } from 'vitest';

describe('evaluateGenerationAdmission', () => {
  it('requires a subscription for the no-subscription tier', () => {
    expect(evaluateGenerationAdmission({ tier: 'free' })).toBe(
      'subscription_required',
    );
  });

  it('admits paid tiers', () => {
    expect(evaluateGenerationAdmission({ tier: 'starter' })).toBe('ok');
    expect(evaluateGenerationAdmission({ tier: 'pro' })).toBe('ok');
  });
});
