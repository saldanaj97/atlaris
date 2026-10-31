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
      expect(features.every((line) => !/\bexports?\b/i.test(line))).toBe(true);
    }
  });
});

describe('PRICING_PLAN_FEATURES', () => {
  it('singularizes a limit of one instead of "1 active learning plans"', () => {
    expect(PRICING_PLAN_FEATURES.free).toContain('1 active plan');
    expect(PRICING_PLAN_FEATURES.free.join(' ')).not.toMatch(/1 active plans/);
  });

  it('does not advertise a zero as a feature on Free', () => {
    expect(PRICING_PLAN_FEATURES.free.join(' ')).not.toMatch(/\b0\b/);
    expect(PRICING_PLAN_FEATURES.free.join(' ')).not.toMatch(/regenerations/);
  });

  it('lists each tier with limits taken from the tier configuration', () => {
    expect(PRICING_PLAN_FEATURES.free).toEqual([
      '1 active plan',
      'Plans up to 2 weeks',
      'Free models, chosen for you',
      'Lessons for every module',
    ]);
    expect(PRICING_PLAN_FEATURES.starter).toEqual([
      '10 active plans',
      'Plans up to 2 months',
      '5 regenerations per month',
      'Choose from a curated model list',
      'Lessons for every module',
    ]);
  });

  it('describes Pro without overstating the plan length', () => {
    expect(PRICING_PLAN_FEATURES.pro).toContain('Unlimited active plans');
    expect(PRICING_PLAN_FEATURES.pro).toContain('Plans up to 6 months');
    expect(PRICING_PLAN_FEATURES.pro).toContain('25 regenerations per month');
    expect(PRICING_PLAN_FEATURES.pro.join(' ')).not.toMatch(
      /unlimited (scheduling|plan length)/i,
    );
  });
});

describe('PRICING_COMPARISON_ROWS', () => {
  it('fills every cell with a real value, never a placeholder', () => {
    for (const row of PRICING_COMPARISON_ROWS) {
      for (const value of Object.values(row.values)) {
        expect(value === true || value.trim().length > 0).toBe(true);
      }
    }
  });

  it('compares the five plan dimensions across the three tiers', () => {
    expect(
      PRICING_COMPARISON_ROWS.map((row) => [
        row.label,
        row.values.free,
        row.values.starter,
        row.values.pro,
      ]),
    ).toEqual([
      ['Active plans', '1', '10', 'Unlimited'],
      ['Longest plan', '2 weeks', '2 months', '6 months'],
      ['Regenerations per month', '0', '5', '25'],
      ['Models', 'Free models', 'Curated list', 'Full catalog'],
      ['Lessons', true, true, true],
    ]);
  });
});
