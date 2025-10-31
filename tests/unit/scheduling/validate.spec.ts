import { describe, expect, it } from 'vitest';
import {
  validateSchedule,
  validateTaskResources,
} from '@/lib/scheduling/validate';
import type { ScheduleJson } from '@/lib/scheduling/types';

describe('Schedule Validation', () => {
  describe('validateSchedule', () => {
    it('should validate a correct schedule', () => {
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

      expect(() => validateSchedule(schedule)).not.toThrow();
    });

    it('should throw error for empty weeks array', () => {
      const schedule: ScheduleJson = {
        weeks: [],
        totalWeeks: 0,
        totalSessions: 0,
      };

      expect(() => validateSchedule(schedule)).toThrow(
        'Schedule must have at least one week'
      );
    });

    it('should throw error for week with no days', () => {
      const schedule: ScheduleJson = {
        weeks: [
          {
            weekNumber: 1,
            startDate: '2025-02-03',
            endDate: '2025-02-09',
            days: [],
          },
        ],
        totalWeeks: 1,
        totalSessions: 0,
      };

      expect(() => validateSchedule(schedule)).toThrow(
        'Week 1 has no scheduled days'
      );
    });
  });

  describe('validateTaskResources', () => {
    it('should validate tasks with resources', () => {
      const tasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          resources: [{ id: 'res-1', url: 'https://example.com' }],
        },
        {
          id: 'task-2',
          title: 'Task 2',
          resources: [{ id: 'res-2', url: 'https://example.com' }],
        },
      ];

      const result = validateTaskResources(tasks);
      expect(result.valid).toBe(true);
      expect(result.tasksWithoutResources).toHaveLength(0);
    });

    it('should identify tasks without resources', () => {
      const tasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          resources: [],
        },
        {
          id: 'task-2',
          title: 'Task 2',
          resources: [{ id: 'res-1', url: 'https://example.com' }],
        },
      ];

      const result = validateTaskResources(tasks);
      expect(result.valid).toBe(false);
      expect(result.tasksWithoutResources).toHaveLength(1);
      expect(result.tasksWithoutResources[0]).toBe('task-1');
    });
  });
});
