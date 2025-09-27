import { describe, expect, it } from 'vitest';

import {
  MODULE_MAX_MINUTES,
  MODULE_MIN_MINUTES,
  TASK_MAX_MINUTES,
  TASK_MIN_MINUTES,
  aggregateNormalizationFlags,
  normalizeModuleMinutes,
  normalizeTaskMinutes,
} from '@/lib/utils/effort';
import { truncateToLength } from '@/lib/utils/truncation';

describe('truncateToLength', () => {
  it('returns original value when within bounds', () => {
    const result = truncateToLength('Data Science', 200);
    expect(result).toEqual({
      value: 'Data Science',
      truncated: false,
      originalLength: 12,
    });
  });

  it('truncates strings that exceed the maximum length', () => {
    const longString = 'a'.repeat(205);
    const result = truncateToLength(longString, 200);
    expect(result.value).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(result.originalLength).toBe(205);
  });

  it('returns undefined metadata when input is nullish', () => {
    expect(truncateToLength(undefined, 200)).toEqual({
      value: undefined,
      truncated: false,
      originalLength: undefined,
    });

    expect(truncateToLength(null, 200)).toEqual({
      value: undefined,
      truncated: false,
      originalLength: undefined,
    });
  });

  it('throws when maxLength is non-positive', () => {
    expect(() => truncateToLength('test', 0)).toThrow(/greater than zero/);
  });
});

describe('normalizeModuleMinutes', () => {
  it('leaves values within range untouched', () => {
    const value = MODULE_MIN_MINUTES + 60;
    const result = normalizeModuleMinutes(value);
    expect(result).toEqual({ value, clamped: false });
  });

  it('clamps values below minimum', () => {
    const result = normalizeModuleMinutes(MODULE_MIN_MINUTES - 10);
    expect(result).toEqual({ value: MODULE_MIN_MINUTES, clamped: true });
  });

  it('clamps values above maximum', () => {
    const result = normalizeModuleMinutes(MODULE_MAX_MINUTES + 50);
    expect(result).toEqual({ value: MODULE_MAX_MINUTES, clamped: true });
  });
});

describe('normalizeTaskMinutes', () => {
  it('leaves values within range untouched', () => {
    const value = TASK_MIN_MINUTES + 10;
    const result = normalizeTaskMinutes(value);
    expect(result).toEqual({ value, clamped: false });
  });

  it('clamps values below minimum', () => {
    const result = normalizeTaskMinutes(TASK_MIN_MINUTES - 3);
    expect(result).toEqual({ value: TASK_MIN_MINUTES, clamped: true });
  });

  it('clamps values above maximum', () => {
    const result = normalizeTaskMinutes(TASK_MAX_MINUTES + 20);
    expect(result).toEqual({ value: TASK_MAX_MINUTES, clamped: true });
  });
});

describe('aggregateNormalizationFlags', () => {
  it('aggregates clamped state across modules and tasks', () => {
    const moduleFlags = [
      { value: 100, clamped: false },
      { value: MODULE_MAX_MINUTES, clamped: true },
    ];
    const taskFlags = [
      { value: TASK_MIN_MINUTES, clamped: false },
      { value: TASK_MAX_MINUTES, clamped: true },
    ];

    expect(aggregateNormalizationFlags(moduleFlags, taskFlags)).toEqual({
      modulesClamped: true,
      tasksClamped: true,
    });
  });

  it('returns false flags when nothing was clamped', () => {
    const moduleFlags = [{ value: MODULE_MIN_MINUTES + 10, clamped: false }];
    const taskFlags = [{ value: TASK_MIN_MINUTES + 2, clamped: false }];

    expect(aggregateNormalizationFlags(moduleFlags, taskFlags)).toEqual({
      modulesClamped: false,
      tasksClamped: false,
    });
  });
});
