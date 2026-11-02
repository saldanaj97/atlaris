import { planActionLabel } from '@/app/(app)/plans/components/plan-utils';
import { describe, expect, it } from 'vitest';

describe('planActionLabel', () => {
  it.each([
    ['not_started', 0, 'Start learning'],
    ['active', 0, 'Start learning'],
    ['active', 3, 'Continue learning'],
    ['paused', 0, 'Start learning'],
    ['paused', 2, 'Continue learning'],
    ['generating', 0, 'View progress'],
    ['completed', 8, 'View plan'],
    ['failed', 0, 'View plan'],
  ] as const)(
    'labels a %s plan with %i tasks done "%s"',
    (status, completedTasks, label) => {
      expect(planActionLabel(status, completedTasks)).toBe(label);
    },
  );
});
