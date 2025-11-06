import type { calendar_v3 } from 'googleapis';

interface Task {
  id: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
}

export function mapTaskToCalendarEvent(
  task: Task,
  startTime: Date
): calendar_v3.Schema$Event {
  const endTime = new Date(
    startTime.getTime() + task.estimatedMinutes * 60 * 1000
  );

  const event: calendar_v3.Schema$Event = {
    summary: task.title,
    description: task.description || undefined,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'UTC',
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 15 }],
    },
  };

  return event;
}

export function generateSchedule(
  tasks: Task[],
  weeklyHours: number
): Map<string, Date> {
  const schedule = new Map<string, Date>();
  const hoursPerDay = weeklyHours / 7;
  const minutesPerDay = hoursPerDay * 60;

  const now = new Date();
  let currentDate = new Date(now);
  currentDate.setHours(9, 0, 0, 0); // Start at 9 AM
  if (currentDate <= now) {
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(9, 0, 0, 0);
  }
  let minutesUsedToday = 0;

  tasks.forEach((task) => {
    // Move to next day if task doesn't fit
    if (minutesUsedToday + task.estimatedMinutes > minutesPerDay) {
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(9, 0, 0, 0);
      minutesUsedToday = 0;
    }

    schedule.set(task.id, new Date(currentDate));

    currentDate = new Date(
      currentDate.getTime() + task.estimatedMinutes * 60 * 1000
    );
    minutesUsedToday += task.estimatedMinutes;
  });

  return schedule;
}
