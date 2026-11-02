import { planActionLabel } from '@/app/(app)/plans/components/plan-utils';
import { describe, expect, it } from 'vitest';

describe('planActionLabel', () => {
  it.each([
    ['not_started', 'Start learning'],
    ['active', 'Continue learning'],
    ['paused', 'Continue learning'],
    ['generating', 'View progress'],
    ['completed', 'View plan'],
    ['failed', 'View plan'],
  ] as const)('labels a %s plan "%s"', (status, label) => {
    expect(planActionLabel(status)).toBe(label);
  });
});
