import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ScheduleWeekList from '@/components/plans/ScheduleWeekList';
import type { ScheduleJson } from '@/lib/scheduling/types';

describe('ScheduleWeekList', () => {
  it('should render week headings', () => {
    const schedule: ScheduleJson = {
      weeks: [
        {
          weekNumber: 1,
          startDate: '2025-02-03',
          endDate: '2025-02-09',
          days: [
            {
              dayNumber: 1,
              date: '2025-02-03',
              sessions: [
                {
                  taskId: 'task-1',
                  taskTitle: 'Learn TypeScript',
                  estimatedMinutes: 60,
                  moduleId: 'mod-1',
                  moduleName: 'Module 1',
                },
              ],
            },
          ],
        },
      ],
      totalWeeks: 1,
      totalSessions: 1,
    };

    render(<ScheduleWeekList schedule={schedule} />);
    expect(screen.getByText(/Week 1/i)).toBeDefined();
  });

  it('should display task titles and time estimates', () => {
    const schedule: ScheduleJson = {
      weeks: [
        {
          weekNumber: 1,
          startDate: '2025-02-03',
          endDate: '2025-02-09',
          days: [
            {
              dayNumber: 1,
              date: '2025-02-03',
              sessions: [
                {
                  taskId: 'task-1',
                  taskTitle: 'Build React App',
                  estimatedMinutes: 90,
                  moduleId: 'mod-1',
                  moduleName: 'Frontend Module',
                },
              ],
            },
          ],
        },
      ],
      totalWeeks: 1,
      totalSessions: 1,
    };

    render(<ScheduleWeekList schedule={schedule} />);
    expect(screen.getByText(/Build React App/i)).toBeDefined();
    expect(screen.getByText(/1\.5 hrs/i)).toBeDefined();
  });

  it('should display module badges', () => {
    const schedule: ScheduleJson = {
      weeks: [
        {
          weekNumber: 1,
          startDate: '2025-02-03',
          endDate: '2025-02-09',
          days: [
            {
              dayNumber: 1,
              date: '2025-02-03',
              sessions: [
                {
                  taskId: 'task-1',
                  taskTitle: 'Task 1',
                  estimatedMinutes: 60,
                  moduleId: 'mod-1',
                  moduleName: 'Core Concepts',
                },
              ],
            },
          ],
        },
      ],
      totalWeeks: 1,
      totalSessions: 1,
    };

    render(<ScheduleWeekList schedule={schedule} />);
    expect(screen.getByText(/Core Concepts/i)).toBeDefined();
  });
});
