import { PRICING_FEATURES_BY_CLERK_SLUG } from '@/app/(marketing)/pricing/pricing-plan-features';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import { describe, expect, it } from 'vitest';

describe('PRICING_FEATURES_BY_CLERK_SLUG', () => {
  it('maps each Clerk plan slug to non-empty marketing feature bullets', () => {
    for (const slug of Object.values(CLERK_BILLING_PLAN_SLUGS)) {
      const features = PRICING_FEATURES_BY_CLERK_SLUG[slug];
      expect(features?.length).toBeGreaterThan(0);
      expect(features.every((line) => line.trim().length > 0)).toBe(true);
    }
  });

  it('describes Pro limits without overstating the product horizon', () => {
    const proFeatures =
      PRICING_FEATURES_BY_CLERK_SLUG[CLERK_BILLING_PLAN_SLUGS.pro];
    expect(proFeatures).toContain('24-week scheduling horizon');
    expect(proFeatures).toContain('Unlimited active learning plans');
    expect(proFeatures).toContain('Unlimited exports per month');
  });
});
