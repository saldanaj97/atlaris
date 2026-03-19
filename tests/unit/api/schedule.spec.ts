import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  resolveScheduleTimezone,
} from '@/features/scheduling/schedule-api';
import type { DbClient } from '@/lib/db/types';

describe('resolveScheduleTimezone', () => {
  it('returns DEFAULT_SCHEDULE_TIMEZONE when no user timezone is available (fallback)', () => {
    const db = null as unknown as DbClient;
    const result = resolveScheduleTimezone('user-1', db);
    expect(result).toBe(DEFAULT_SCHEDULE_TIMEZONE);
  });

  it('returns UTC as the default fallback value', async () => {
    expect(DEFAULT_SCHEDULE_TIMEZONE).toBe('UTC');
  });
});
