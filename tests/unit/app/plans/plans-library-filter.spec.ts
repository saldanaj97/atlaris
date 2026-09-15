import {
  plansLibraryFilterLabel,
  resolvePlansLibraryFilterStatus,
} from '@/app/(app)/plans/plans-library-filter';
import { describe, expect, it } from 'vitest';

describe('resolvePlansLibraryFilterStatus', () => {
  it.each([
    ['all', 'all'],
    ['active', 'active'],
    ['completed', 'completed'],
    ['generating', 'generating'],
    ['failed', 'failed'],
    ['not_started', 'not_started'],
    ['inactive', 'inactive'],
    ['not-started', 'not_started'],
    ['paused', 'inactive'],
  ] as const)('honors supported or aliased status %s', (value, expected) => {
    expect(resolvePlansLibraryFilterStatus(value)).toBe(expected);
  });

  it.each(['unknown', ''])(
    'falls back to All for unknown status %s',
    (value) => {
      expect(resolvePlansLibraryFilterStatus(value)).toBe('all');
    },
  );
});

describe('plansLibraryFilterLabel', () => {
  it.each([
    ['all', 'All plans'],
    ['active', 'Active'],
    ['completed', 'Completed'],
    ['generating', 'Generating'],
    ['failed', 'Failed'],
    ['not_started', 'Not started'],
    ['inactive', 'Inactive'],
  ] as const)('labels %s', (status, label) => {
    expect(plansLibraryFilterLabel(status)).toBe(label);
  });
});
