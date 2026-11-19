import {
  PRICING_COMPARISON_ROWS,
  PRICING_FEATURES_BY_CLERK_SLUG,
  PRICING_PLAN_FEATURES,
} from '@/app/(landing)/pricing/pricing-plan-features';
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
});

describe('PRICING_PLAN_FEATURES', () => {
  it('lists each tier with limits taken from the tier configuration', () => {
    expect(PRICING_PLAN_FEATURES.free).toEqual([
      '1 plan included',
      'Plans up to 2 weeks',
      'Free models, chosen for you',
      'Lessons for every module',
    ]);
    expect(PRICING_PLAN_FEATURES.starter).toEqual([
      '10 active plans',
      'Plans up to 8 weeks',
      '5 regenerations per month',
      'Choose from a curated model list',
      'Lessons for every module',
    ]);
  });

  it('lists Pro with unlimited active plans, 24-week plans and 25 regenerations', () => {
    expect(PRICING_PLAN_FEATURES.pro).toContain('Unlimited active plans');
    expect(PRICING_PLAN_FEATURES.pro).toContain('Plans up to 24 weeks');
    expect(PRICING_PLAN_FEATURES.pro).toContain('25 regenerations per month');
  });
});

describe('PRICING_COMPARISON_ROWS', () => {
  it('compares the five plan dimensions across the three tiers', () => {
    expect(
      PRICING_COMPARISON_ROWS.map((row) => [
        row.label,
        row.values.free,
        row.values.starter,
        row.values.pro,
      ]),
    ).toEqual([
      ['Plans included', '1', '10 at a time', 'Unlimited'],
      ['Longest plan', '2 weeks', '8 weeks', '24 weeks'],
      ['Regenerations per month', '0', '5', '25'],
      ['Models', 'Free models', 'Curated list', 'Full catalog'],
      ['Lessons', true, true, true],
    ]);
  });
});
