import {
  DEFAULT_SCHEDULE_TIMEZONE,
  resolveScheduleTimezone,
} from '@/lib/api/schedule';
import type { DbClient } from '@/lib/db/types';
import { describe, expect, it } from 'vitest';

describe('resolveScheduleTimezone', () => {
  it('returns DEFAULT_SCHEDULE_TIMEZONE when no user timezone is available (fallback)', async () => {
    const db = null as unknown as DbClient;
    const result = await resolveScheduleTimezone('user-1', db);
    expect(result).toBe(DEFAULT_SCHEDULE_TIMEZONE);
  });

  it('returns UTC as the default fallback value', async () => {
    expect(DEFAULT_SCHEDULE_TIMEZONE).toBe('UTC');
  });
});
