import type { ScheduledEvent } from '@/app/dashboard/types';

/**
 * Creates mock scheduled events with deterministic timestamps.
 * Uses a fixed base time (2024-01-01T12:00:00Z) plus relative offsets
 * to ensure consistent behavior across test runs.
 *
 * @param baseTime - Optional base timestamp in milliseconds. Defaults to a fixed date.
 * @returns Array of mock scheduled events
 */
export function createMockScheduledEvents(baseTime?: number): ScheduledEvent[] {
  // Use fixed base time: 2024-01-01T12:00:00Z (1704110400000 ms)
  const base = baseTime ?? new Date('2024-01-01T12:00:00Z').getTime();

  return [
    {
      id: 'event-1',
      title: 'Continue current module',
      type: 'milestone',
      dateTime: new Date(base + 1000 * 60 * 60 * 3), // +3 hours
      duration: '30m',
      courseName: 'Current Learning Plan',
      isUrgent: true,
    },
    {
      id: 'event-2',
      title: 'Weekly review session',
      type: 'assignment',
      dateTime: new Date(base + 1000 * 60 * 60 * 24), // +24 hours
      courseName: 'Learning Goals',
    },
    {
      id: 'event-3',
      title: 'Progress checkpoint',
      type: 'quiz',
      dateTime: new Date(base + 1000 * 60 * 60 * 24 * 2), // +48 hours
      duration: '15m',
      courseName: 'Self Assessment',
    },
  ];
}

/**
 * Pre-generated fixture with fixed timestamps.
 * Use this for static imports where deterministic behavior is required.
 */
export const scheduledEventsFixture: ScheduledEvent[] =
  createMockScheduledEvents();
