import { describe, it, expect } from 'vitest';
import {
  mapTaskToCalendarEvent,
  generateSchedule,
} from '@/lib/integrations/google-calendar/mapper';

describe.skip('Google Calendar Mapper', () => {
  it('maps task to calendar event with correct times', () => {
    const start = new Date('2025-01-01T09:00:00Z');
    const event = mapTaskToCalendarEvent(
      {
        id: 't1',
        title: 'Test Task',
        description: 'Desc',
        estimatedMinutes: 60,
      },
      start
    );

    expect(event.summary).toBe('Test Task');
    expect(event.description).toBe('Desc');
    expect(event.start?.dateTime).toBe(start.toISOString());
    expect(event.end?.dateTime).toBe(
      new Date(start.getTime() + 60 * 60 * 1000).toISOString()
    );
  });

  it('generates a schedule map for tasks', () => {
    const tasks = [
      { id: 'a', title: 'A', description: null, estimatedMinutes: 30 },
      { id: 'b', title: 'B', description: null, estimatedMinutes: 30 },
    ];
    const schedule = generateSchedule(tasks, 7); // 1 hour/day
    expect(schedule instanceof Map).toBe(true);
    expect(schedule.has('a')).toBe(true);
    expect(schedule.has('b')).toBe(true);
  });
});
