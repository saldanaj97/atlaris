import { resolvePlansLibraryFilterStatus } from '@/app/(app)/plans/plans-library-filter';
import { describe, expect, it } from 'vitest';

describe('resolvePlansLibraryFilterStatus', () => {
  it.each([
    ['all', 'all'],
    ['active', 'active'],
    ['completed', 'completed'],
    ['generating', 'generating'],
    ['failed', 'failed'],
  ] as const)('keeps the visible %s filter', (value, expected) => {
    expect(resolvePlansLibraryFilterStatus(value)).toBe(expected);
  });

  it.each(['not_started', 'not-started', 'inactive', 'paused', 'unknown', ''])(
    'falls back to All for retired or unknown status %s',
    (value) => {
      expect(resolvePlansLibraryFilterStatus(value)).toBe('all');
    },
  );
});
