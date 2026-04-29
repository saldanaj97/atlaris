import { describe, expect, it } from 'vitest';
import { getActivityRelativeLabel } from '@/app/(app)/dashboard/components/activity-utils';
import { getPlanLastActivityRelative } from '@/app/(app)/plans/components/plan-utils';
import {
  formatRelativePast,
  formatScheduledEventRelative,
  toValidDate,
} from '@/lib/date/relative-time';

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

  it.each([
    ['2025-06-15T12:30:00.000Z', 'In 30 min'],
    ['2025-06-15T15:00:00.000Z', 'In 3h'],
    ['2025-06-15T12:00:30.000Z', 'Now'],
    ['2025-06-15T11:30:00.000Z', '30 minutes ago'],
    ['2025-06-15T12:00:00.000Z', 'Now'],
    ['2025-06-18T12:00:00.000Z', 'In 3 days'],
  ])('formatScheduledEventRelative returns %s -> %s', (input, expected) => {
    expect(formatScheduledEventRelative(new Date(input), ref)).toBe(expected);
  });

  it('formatScheduledEventRelative matches dashboard scheduled-event phrasing', () => {
    const tomorrow = new Date('2025-06-16T14:30:00.000Z');
    expect(formatScheduledEventRelative(tomorrow, ref)).toMatch(
      /^Tomorrow at /,
    );
    expect(
      formatScheduledEventRelative(new Date('2025-06-23T12:00:00.000Z'), ref),
    ).toBe(
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(new Date('2025-06-23T12:00:00.000Z')),
    );
  });

  it('supports deterministic now injection in dashboard and plan helpers', () => {
    expect(
      getActivityRelativeLabel(new Date('2025-06-15T12:30:00.000Z'), ref),
    ).toBe('In 30 min');
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
