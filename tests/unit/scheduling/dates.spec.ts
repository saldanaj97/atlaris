import { describe, expect, it } from 'vitest';
import { addDaysToDate, getWeekBoundaries } from '@/features/scheduling/dates';

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

    it('should throw RangeError for weekNumber = 0', () => {
      expect(() => getWeekBoundaries('2025-02-03', 0)).toThrow(RangeError);
    });

    it('should throw RangeError for negative weekNumber', () => {
      expect(() => getWeekBoundaries('2025-02-03', -1)).toThrow(RangeError);
    });

    it('should throw RangeError for non-integer weekNumber', () => {
      expect(() => getWeekBoundaries('2025-02-03', 1.5)).toThrow(RangeError);
    });
  });
});
