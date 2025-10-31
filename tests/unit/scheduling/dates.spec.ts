import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  addWeeksToDate,
  getWeekBoundaries,
  formatDateISO,
  parseISODate,
  getDaysBetween,
} from '@/lib/scheduling/dates';

describe('Date Utilities', () => {
  describe('addDaysToDate', () => {
    it('should add days to a date', () => {
      const result = addDaysToDate('2025-02-01', 7);
      expect(result).toBe('2025-02-08');
    });

    it('should handle month boundaries', () => {
      const result = addDaysToDate('2025-02-28', 1);
      expect(result).toBe('2025-03-01');
    });

    it('should handle negative days', () => {
      const result = addDaysToDate('2025-02-10', -5);
      expect(result).toBe('2025-02-05');
    });
  });

  describe('addWeeksToDate', () => {
    it('should add weeks to a date', () => {
      const result = addWeeksToDate('2025-02-01', 2);
      expect(result).toBe('2025-02-15');
    });
  });

  describe('getWeekBoundaries', () => {
    it('should calculate week boundaries from anchor date', () => {
      const { startDate, endDate } = getWeekBoundaries('2025-02-03', 1);
      expect(startDate).toBe('2025-02-03');
      expect(endDate).toBe('2025-02-09');
    });

    it('should calculate week 2 boundaries', () => {
      const { startDate, endDate } = getWeekBoundaries('2025-02-03', 2);
      expect(startDate).toBe('2025-02-10');
      expect(endDate).toBe('2025-02-16');
    });
  });

  describe('formatDateISO', () => {
    it('should format Date to ISO string', () => {
      // Create date using UTC to ensure timezone-independent expectation
      const date = new Date(Date.UTC(2025, 1, 1, 12, 0, 0));
      const result = formatDateISO(date);
      expect(result).toBe('2025-02-01');
    });
  });

  describe('parseISODate', () => {
    it('should parse ISO string to Date', () => {
      const result = parseISODate('2025-02-01');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(1); // February (0-indexed)
      expect(result.getDate()).toBe(1);
    });
  });

  describe('getDaysBetween', () => {
    it('should calculate days between two dates', () => {
      const days = getDaysBetween('2025-02-01', '2025-02-08');
      expect(days).toBe(7);
    });

    it('should handle negative differences', () => {
      const days = getDaysBetween('2025-02-08', '2025-02-01');
      expect(days).toBe(-7);
    });
  });
});
