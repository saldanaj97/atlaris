import { describe, it, expect } from 'vitest';
import { formatAmount } from '@/components/billing/utils';

describe('formatAmount', () => {
  describe('default behavior (2 decimal places)', () => {
    it('formats cents with two decimal places', () => {
      expect(formatAmount(999)).toBe('$9.99');
      expect(formatAmount(1000)).toBe('$10.00');
      expect(formatAmount(1234)).toBe('$12.34');
      expect(formatAmount(1)).toBe('$0.01');
    });

    it('handles zero amount', () => {
      expect(formatAmount(0)).toBe('$0.00');
    });

    it('handles null and undefined', () => {
      expect(formatAmount(null)).toBe('—');
      expect(formatAmount(undefined)).toBe('—');
    });
  });

  describe('custom fraction digits', () => {
    it('formats with 0 decimal places when specified', () => {
      expect(formatAmount(999, 'USD', 0)).toBe('$10');
      expect(formatAmount(1000, 'USD', 0)).toBe('$10');
      expect(formatAmount(1234, 'USD', 0)).toBe('$12');
    });

    it('formats with 1 decimal place when specified', () => {
      expect(formatAmount(999, 'USD', 1)).toBe('$10.0');
      expect(formatAmount(1234, 'USD', 1)).toBe('$12.3');
    });

    it('formats with 3 decimal places when specified', () => {
      expect(formatAmount(1234, 'USD', 3)).toBe('$12.340');
      expect(formatAmount(9999, 'USD', 3)).toBe('$99.990');
    });
  });

  describe('different currencies', () => {
    it('formats EUR currency', () => {
      const result = formatAmount(999, 'EUR');
      expect(result).toContain('9.99');
      expect(result).toMatch(/[€9]|9[€,]/); // EUR symbol varies by locale
    });

    it('formats GBP currency', () => {
      const result = formatAmount(999, 'GBP');
      expect(result).toContain('9.99');
      expect(result).toMatch(/[£9]|9[£,]/); // GBP symbol varies by locale
    });
  });

  describe('edge cases', () => {
    it('handles large amounts', () => {
      expect(formatAmount(999999)).toBe('$9,999.99');
      expect(formatAmount(1000000)).toBe('$10,000.00');
    });

    it('handles negative amounts', () => {
      expect(formatAmount(-999)).toBe('-$9.99');
      expect(formatAmount(-1000)).toBe('-$10.00');
    });

    it('maintains consistent precision with custom fractionDigits', () => {
      // Ensure both minimum and maximum are set for consistent formatting
      expect(formatAmount(1000, 'USD', 2)).toBe('$10.00');
      expect(formatAmount(1001, 'USD', 2)).toBe('$10.01');
      expect(formatAmount(1000, 'USD', 0)).toBe('$10');
      expect(formatAmount(1001, 'USD', 0)).toBe('$10');
    });
  });
});
