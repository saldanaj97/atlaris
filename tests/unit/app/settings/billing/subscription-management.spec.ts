import { formatSubscriptionStatus } from '@/app/(app)/settings/billing/components/subscription-management';
import { describe, expect, it } from 'vitest';

describe('formatSubscriptionStatus', () => {
  it.each([
    ['active', 'Active'],
    ['trialing', 'Trial'],
    ['past_due', 'Past due'],
    ['canceled', 'Canceled'],
  ])('maps %s to %s', (status, label) => {
    expect(formatSubscriptionStatus(status)).toBe(label);
  });

  it('shows a dash when there is no status', () => {
    expect(formatSubscriptionStatus(null)).toBe('—');
  });

  it('sentence-cases an unmapped status instead of showing the raw value', () => {
    expect(formatSubscriptionStatus('incomplete_expired')).toBe(
      'Incomplete expired',
    );
  });
});
