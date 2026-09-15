import { planListsFeature } from '@/app/(landing)/pricing/components/pricing-comparison';
import { describe, expect, it } from 'vitest';

describe('planListsFeature', () => {
  it('treats combined priority-queue copy as covering the starter row', () => {
    expect(
      planListsFeature(
        { features: ['Priority queue + analytics'] },
        'priority queue access',
      ),
    ).toBe(true);
  });

  it('does not treat unrelated one-word overlap as the same capability', () => {
    expect(
      planListsFeature(
        { features: ['Priority support'] },
        'priority queue access',
      ),
    ).toBe(false);
  });

  it('keeps different numeric limits on separate rows', () => {
    expect(
      planListsFeature(
        { features: ['10 active learning plans'] },
        '1 active learning plans',
      ),
    ).toBe(false);
  });
});
