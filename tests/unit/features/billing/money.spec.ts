import { describe, expect, it } from 'vitest';

import { formatAmount } from '@/features/billing/money';

describe('formatAmount', () => {
  it('em dash for non-finite cents', () => {
    expect(formatAmount(Number.POSITIVE_INFINITY, 'USD')).toBe('—');
    expect(formatAmount(Number.NaN, 'USD')).toBe('—');
  });
});
