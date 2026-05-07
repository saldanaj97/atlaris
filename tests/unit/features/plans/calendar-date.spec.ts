import { describe, expect, it } from 'vitest';

import { toPlanCalendarDate } from '@/features/plans/calendar-date';

describe('toPlanCalendarDate', () => {
  it('accepts a real YYYY-MM-DD calendar date', () => {
    expect(toPlanCalendarDate('2026-02-28')).toBe('2026-02-28');
  });

  it.each([null, undefined, ''])(
    'treats %s as an absent calendar date',
    (value) => {
      expect(toPlanCalendarDate(value)).toBeUndefined();
    },
  );

  it.each(['02/28/2026', '2026-2-28', '2026-02-30'])(
    'rejects non-ISO calendar date formats and impossible dates: %s',
    (value) => {
      expect(toPlanCalendarDate(value)).toBeUndefined();
    },
  );
});
