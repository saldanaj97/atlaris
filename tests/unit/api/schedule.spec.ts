import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SCHEDULE_TIMEZONE,
	resolveScheduleTimezone,
} from '@/features/scheduling/schedule-api';

describe('resolveScheduleTimezone', () => {
	it('returns DEFAULT_SCHEDULE_TIMEZONE when no user timezone is available (fallback)', () => {
		const result = resolveScheduleTimezone('user-1', null);
		expect(result).toBe(DEFAULT_SCHEDULE_TIMEZONE);
	});

	it('returns UTC as the default fallback value', async () => {
		expect(DEFAULT_SCHEDULE_TIMEZONE).toBe('UTC');
	});
});
