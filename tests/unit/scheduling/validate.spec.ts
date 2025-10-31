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

    it('should allow empty schedule (no weeks)', () => {
      const schedule: ScheduleJson = {
        weeks: [],
        totalWeeks: 0,
        totalSessions: 0,
      };

      expect(() => validateSchedule(schedule)).not.toThrow();
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

    it('should allow days with zero sessions', () => {
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
                sessions: [],
              },
            ],
          },
        ],
        totalWeeks: 1,
        totalSessions: 0,
      };

      expect(() => validateSchedule(schedule)).not.toThrow();
    });
  });

  describe('validateTaskResources', () => {
    it('should validate tasks with resources', () => {
      const now = new Date();
      const tasks = [
        {
          id: 'task-1',
          moduleId: 'mod-1',
          order: 1,
          title: 'Task 1',
          description: null,
          estimatedMinutes: 60,
          createdAt: now,
          updatedAt: now,
          resources: [
            {
              id: 'tr-1',
              taskId: 'task-1',
              resourceId: 'res-1',
              order: 1,
              notes: null,
              createdAt: now,
              resource: {
                id: 'res-1',
                type: 'youtube' as const,
                title: 'Resource 1',
                url: 'https://example.com',
                domain: null,
                author: null,
                durationMinutes: null,
                costCents: null,
                currency: null,
                tags: null,
                createdAt: now,
              },
            },
          ],
        },
        {
          id: 'task-2',
          moduleId: 'mod-1',
          order: 2,
          title: 'Task 2',
          description: null,
          estimatedMinutes: 60,
          createdAt: now,
          updatedAt: now,
          resources: [
            {
              id: 'tr-2',
              taskId: 'task-2',
              resourceId: 'res-2',
              order: 1,
              notes: null,
              createdAt: now,
              resource: {
                id: 'res-2',
                type: 'youtube' as const,
                title: 'Resource 2',
                url: 'https://example.com/2',
                domain: null,
                author: null,
                durationMinutes: null,
                costCents: null,
                currency: null,
                tags: null,
                createdAt: now,
              },
            },
          ],
        },
      ];

      const result = validateTaskResources(tasks);
      expect(result.valid).toBe(true);
      expect(result.tasksWithoutResources).toHaveLength(0);
    });

    it('should identify tasks without resources', () => {
      const now = new Date();
      const tasks = [
        {
          id: 'task-1',
          moduleId: 'mod-1',
          order: 1,
          title: 'Task 1',
          description: null,
          estimatedMinutes: 60,
          createdAt: now,
          updatedAt: now,
          resources: [],
        },
        {
          id: 'task-2',
          moduleId: 'mod-1',
          order: 2,
          title: 'Task 2',
          description: null,
          estimatedMinutes: 60,
          createdAt: now,
          updatedAt: now,
          resources: [
            {
              id: 'tr-3',
              taskId: 'task-2',
              resourceId: 'res-1',
              order: 1,
              notes: null,
              createdAt: now,
              resource: {
                id: 'res-1',
                type: 'youtube' as const,
                title: 'Resource 1',
                url: 'https://example.com',
                domain: null,
                author: null,
                durationMinutes: null,
                costCents: null,
                currency: null,
                tags: null,
                createdAt: now,
              },
            },
          ],
        },
      ];

      const result = validateTaskResources(tasks);
      expect(result.valid).toBe(false);
      expect(result.tasksWithoutResources).toHaveLength(1);
      expect(result.tasksWithoutResources[0]).toBe('task-1');
    });
  });
});
