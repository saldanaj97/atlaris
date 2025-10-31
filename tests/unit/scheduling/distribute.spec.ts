import { describe, expect, it } from 'vitest';
import { distributeTasksToSessions } from '@/lib/scheduling/distribute';
import type { ScheduleInputs } from '@/lib/scheduling/types';

describe('distributeTasksToSessions', () => {
  it('should distribute tasks evenly across default 3 sessions per week', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          estimatedMinutes: 90,
          order: 2,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03', // Monday
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);

    expect(schedule.weeks).toHaveLength(1);
    expect(schedule.weeks[0].days).toHaveLength(3); // Mon, Wed, Fri
    expect(schedule.totalSessions).toBe(3);
  });

  it('should calculate correct total weeks based on total minutes and weekly hours', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 600, // 10 hours
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 5, // 5 hours per week = 2 weeks needed
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);

    expect(schedule.totalWeeks).toBe(2);
  });

  it('should respect task order when distributing', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'First Task',
          estimatedMinutes: 30,
          order: 1,
          moduleId: 'mod-1',
        },
        {
          id: 'task-2',
          title: 'Second Task',
          estimatedMinutes: 30,
          order: 2,
          moduleId: 'mod-1',
        },
        {
          id: 'task-3',
          title: 'Third Task',
          estimatedMinutes: 30,
          order: 3,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);
    const firstSession = schedule.weeks[0].days[0].sessions[0];

    expect(firstSession.taskId).toBe('task-1');
    expect(firstSession.taskTitle).toBe('First Task');
  });

  it('should use Mon/Wed/Fri as default session days from start anchor', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 90,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03', // Monday
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);
    const days = schedule.weeks[0].days;

    expect(days[0].date).toBe('2025-02-03'); // Mon
    expect(days[1].date).toBe('2025-02-05'); // Wed
    expect(days[2].date).toBe('2025-02-07'); // Fri
  });

  it('should throw error when weeklyHours is zero', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 0,
      timezone: 'UTC',
    };

    expect(() => distributeTasksToSessions(inputs)).toThrow(
      'weeklyHours must be greater than 0'
    );
  });

  it('should throw error when weeklyHours is negative', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: -5,
      timezone: 'UTC',
    };

    expect(() => distributeTasksToSessions(inputs)).toThrow(
      'weeklyHours must be greater than 0'
    );
  });

  it('should throw error when task has negative estimatedMinutes', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: -10,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    expect(() => distributeTasksToSessions(inputs)).toThrow(
      'has invalid estimatedMinutes: must be non-negative'
    );
  });

  it('should return empty schedule when tasks array is empty', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);

    expect(schedule.weeks).toHaveLength(0);
    expect(schedule.totalWeeks).toBe(0);
    expect(schedule.totalSessions).toBe(0);
  });

  it('should split large task across multiple weeks', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Large Task',
          estimatedMinutes: 1800, // 30 hours - exceeds weekly capacity
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 10, // 10 hours per week = 3 weeks needed
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);

    expect(schedule.totalWeeks).toBe(3);
    expect(schedule.weeks.length).toBe(3);
    // Verify task is allocated across multiple weeks
    const totalAllocatedMinutes = schedule.weeks.reduce(
      (sum, week) =>
        sum +
        week.days.reduce(
          (daySum, day) =>
            daySum +
            day.sessions.reduce(
              (sessionSum, session) => sessionSum + session.estimatedMinutes,
              0
            ),
          0
        ),
      0
    );
    expect(totalAllocatedMinutes).toBe(1800);
  });

  it('should skip tasks with zero estimatedMinutes', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Zero Minute Task',
          estimatedMinutes: 0,
          order: 1,
          moduleId: 'mod-1',
        },
        {
          id: 'task-2',
          title: 'Valid Task',
          estimatedMinutes: 60,
          order: 2,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-03',
      deadline: null,
      weeklyHours: 10,
      timezone: 'UTC',
    };

    const schedule = distributeTasksToSessions(inputs);

    // Should have 1 week with sessions
    expect(schedule.totalWeeks).toBe(1);
    // Should only include task-2 in sessions (task-1 with 0 minutes is skipped)
    const allTaskIds = schedule.weeks.flatMap((week) =>
      week.days.flatMap((day) => day.sessions.map((s) => s.taskId))
    );
    expect(allTaskIds).not.toContain('task-1');
    expect(allTaskIds).toContain('task-2');
  });
});
