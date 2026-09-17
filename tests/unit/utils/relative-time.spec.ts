import { getPlanLastActivityRelative } from '@/app/(app)/plans/components/plan-utils';
import { formatRelativePast, toValidDate } from '@/lib/date/relative-time';
import { describe, expect, it } from 'vitest';

describe('relative-time', () => {
  const ref = new Date('2025-06-15T12:00:00.000Z');

  it.each([
    ['2025-06-15T11:59:00.000Z', 'Just now'],
    ['2025-06-15T11:55:00.000Z', '5m ago'],
    ['2025-06-15T11:00:00.000Z', '1h ago'],
    ['2025-06-15T10:00:00.000Z', '2h ago'],
    ['2025-06-14T12:00:00.000Z', 'Yesterday'],
    ['2025-06-10T12:00:00.000Z', '5 days ago'],
  ])('formatRelativePast compact returns %s -> %s', (input, expected) => {
    expect(
      formatRelativePast(new Date(input), {
        referenceDate: ref,
        style: 'compact',
      }),
    ).toBe(expected);
  });

  it.each([
    ['2025-06-15T11:59:30.000Z', 'Just now'],
    ['2025-06-15T11:30:00.000Z', '30 minutes ago'],
    ['2025-06-15T09:00:00.000Z', '3 hours ago'],
    ['2025-05-20T12:00:00.000Z', '3 weeks ago'],
  ])('formatRelativePast verbose returns %s -> %s', (input, expected) => {
    expect(
      formatRelativePast(new Date(input), {
        referenceDate: ref,
        style: 'verbose',
      }),
    ).toBe(expected);
  });

  it('returns invalidLabel when date or reference missing', () => {
    expect(
      formatRelativePast(null, {
        referenceDate: ref,
        style: 'compact',
        invalidLabel: 'Recently',
      }),
    ).toBe('Recently');
    expect(
      formatRelativePast(new Date('2025-06-15T11:00:00.000Z'), {
        referenceDate: null,
        style: 'compact',
        invalidLabel: 'Recently',
      }),
    ).toBe('Recently');
  });

  it('supports deterministic now injection in plan helpers', () => {
    expect(
      getPlanLastActivityRelative(
        '2025-06-15T11:55:00.000Z',
        '2025-06-15T12:00:00.000Z',
      ),
    ).toBe('5m ago');
  });

  it('toValidDate parses ISO strings', () => {
    const d = toValidDate('2025-01-02T00:00:00.000Z');
    expect(d?.toISOString()).toBe('2025-01-02T00:00:00.000Z');
  });

  it('clamps future dates to non-negative deltas (legacy plan-card behavior)', () => {
    const future = new Date('2025-06-15T14:00:00.000Z');
    expect(
      formatRelativePast(future, { referenceDate: ref, style: 'compact' }),
    ).toBe('Just now');
  });
});
