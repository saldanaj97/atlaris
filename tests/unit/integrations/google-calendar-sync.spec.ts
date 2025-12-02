import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  IntegrationSyncError,
  NotFoundError,
  ValidationError,
} from '@/lib/api/errors';
import { db } from '@/lib/db/service-role';
import * as mapper from '@/lib/integrations/google-calendar/mapper';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';
import type { GoogleCalendarClient } from '@/lib/integrations/google-calendar/types';

// Helper to create a mock Google Calendar client for unit tests
// This function is called within each test to get a reference to the mock
// calendar that was set up in beforeEach. Using `any` for flexibility in mock
// setup while the helper function provides type safety at the call site.
let mockCalendar: any;
const createMockCalendarClient = (): GoogleCalendarClient => {
  return mockCalendar as GoogleCalendarClient;
};

// Mock the database
vi.mock('@/lib/db/service-role', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the mapper module
vi.mock('@/lib/integrations/google-calendar/mapper', async () => {
  const actual = await vi.importActual<typeof mapper>(
    '@/lib/integrations/google-calendar/mapper'
  );
  return {
    ...actual,
    generateSchedule: vi.fn(),
    mapTaskToCalendarEvent: vi.fn(),
  };
});

describe('Google Calendar Sync', () => {
  const mockPlanId = 'plan-123';

  let mockDbSelect: any;
  let mockDbInsert: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup calendar API mock
    mockCalendar = {
      events: {
        insert: vi.fn(),
        delete: vi.fn(),
      },
    };

    // Setup database mocks
    mockDbSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
    mockDbInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(db as any, 'select').mockReturnValue(mockDbSelect);
    vi.spyOn(db as any, 'insert').mockReturnValue(mockDbInsert);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncPlanToGoogleCalendar', () => {
    it('should throw error when plan not found', async () => {
      mockDbSelect.limit.mockResolvedValue([]);

      const mockClient = createMockCalendarClient();
      await expect(
        syncPlanToGoogleCalendar(mockPlanId, mockClient)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw validation error when no modules found for plan', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
        topic: 'Test Topic',
      };

      // First call returns plan, second call returns empty modules
      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValueOnce([]);
      mockDbSelect.orderBy.mockResolvedValue([]);

      await expect(
        syncPlanToGoogleCalendar(mockPlanId, createMockCalendarClient())
      ).rejects.toThrow(ValidationError);
    });

    it('should create calendar events for all tasks', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
        {
          id: 'task-2',
          title: 'Task 2',
          description: 'Description 2',
          estimatedMinutes: 90,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
        ['task-2', new Date('2025-06-01T10:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      const mockEvent1 = { summary: 'Task 1' };
      const mockEvent2 = { summary: 'Task 2' };
      vi.mocked(mapper.mapTaskToCalendarEvent)
        .mockReturnValueOnce(mockEvent1 as any)
        .mockReturnValueOnce(mockEvent2 as any);

      mockCalendar.events.insert.mockResolvedValue({
        data: { id: 'event-123', status: 'confirmed' },
      });

      const result = await syncPlanToGoogleCalendar(
        mockPlanId,
        createMockCalendarClient()
      );

      expect(result).toBe(2);
      expect(mockCalendar.events.insert).toHaveBeenCalledTimes(2);
    });

    it('should skip tasks that already have calendar events', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValueOnce([{ taskId: 'task-1' }]); // Existing event
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      const result = await syncPlanToGoogleCalendar(
        mockPlanId,
        createMockCalendarClient()
      );

      expect(result).toBe(0);
      expect(mockCalendar.events.insert).not.toHaveBeenCalled();
    });

    it('should retry on API failures', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task 1',
      } as any);

      // First two calls fail, third succeeds
      mockCalendar.events.insert
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({
          data: { id: 'event-123', status: 'confirmed' },
        });

      const result = await syncPlanToGoogleCalendar(
        mockPlanId,
        createMockCalendarClient()
      );

      expect(result).toBe(1);
      expect(mockCalendar.events.insert).toHaveBeenCalledTimes(3);
    });

    it('should handle task without scheduled time', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      // Schedule doesn't include task-1
      vi.mocked(mapper.generateSchedule).mockReturnValue(new Map());

      const result = await syncPlanToGoogleCalendar(
        mockPlanId,
        createMockCalendarClient()
      );

      expect(result).toBe(0);
      expect(mockCalendar.events.insert).not.toHaveBeenCalled();
    });

    it('should throw integration error when event creation returns no ID', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task 1',
      } as any);

      // Return event without ID
      mockCalendar.events.insert.mockResolvedValue({
        data: { status: 'confirmed' },
      });

      await expect(
        syncPlanToGoogleCalendar(mockPlanId, createMockCalendarClient())
      ).rejects.toThrow(IntegrationSyncError);
    });

    it('should delete calendar event if DB insert fails and surface integration error', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task 1',
      } as any);

      mockCalendar.events.insert.mockResolvedValue({
        data: { id: 'event-123', status: 'confirmed' },
      });

      // DB insert fails
      mockDbInsert.values.mockRejectedValue(new Error('DB Error'));

      await expect(
        syncPlanToGoogleCalendar(mockPlanId, createMockCalendarClient())
      ).rejects.toThrow(IntegrationSyncError);

      // Should attempt to delete the created event
      expect(mockCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
      });
    });

    it('should continue syncing other tasks if one fails', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
        {
          id: 'task-2',
          title: 'Task 2',
          description: 'Description 2',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
        ['task-2', new Date('2025-06-01T10:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task',
      } as any);

      // First task fails after retries, second succeeds
      mockCalendar.events.insert
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({
          data: { id: 'event-456', status: 'confirmed' },
        });

      const result = await syncPlanToGoogleCalendar(
        mockPlanId,
        createMockCalendarClient()
      );

      expect(result).toBe(1); // Only second task succeeded
      expect(mockCalendar.events.insert).toHaveBeenCalledTimes(4);
    });

    it('should store sync state after successful sync', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task 1',
      } as any);

      mockCalendar.events.insert.mockResolvedValue({
        data: { id: 'event-123', status: 'confirmed' },
      });

      await syncPlanToGoogleCalendar(mockPlanId, createMockCalendarClient());

      // Check that sync state was inserted
      expect(mockDbInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: mockPlanId,
          userId: 'user-123',
          calendarId: 'primary',
        })
      );
    });

    it('should use primary calendar by default', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task 1',
      } as any);

      mockCalendar.events.insert.mockResolvedValue({
        data: { id: 'event-123', status: 'confirmed' },
      });

      await syncPlanToGoogleCalendar(mockPlanId, createMockCalendarClient());

      expect(mockCalendar.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.any(Object),
      });
    });

    it('should surface a validation error when schedule generation returns nothing', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [
        { id: 'module-1', order: 1 },
        { id: 'module-2', order: 2 },
      ];
      const mockTasks = [
        {
          id: 'task-1',
          moduleId: 'module-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
        {
          id: 'task-2',
          moduleId: 'module-2',
          title: 'Task 2',
          description: 'Description 2',
          estimatedMinutes: 90,
        },
      ];

      mockDbSelect.limit.mockResolvedValue([mockPlan]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      vi.mocked(mapper.generateSchedule).mockReturnValue(new Map());

      await expect(
        syncPlanToGoogleCalendar(mockPlanId, createMockCalendarClient())
      ).rejects.toThrow(ValidationError);

      expect(mapper.generateSchedule).toHaveBeenCalledWith(
        [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'Description 1',
            estimatedMinutes: 60,
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Description 2',
            estimatedMinutes: 90,
          },
        ],
        10
      );
    });

    it('should throw validation error when no tasks exist for the plan', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce([]); // No tasks

      await expect(
        syncPlanToGoogleCalendar(mockPlanId, createMockCalendarClient())
      ).rejects.toThrow(ValidationError);
    });

    it('should handle exponential backoff correctly', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task 1',
      } as any);

      // Fail twice, then succeed
      mockCalendar.events.insert
        .mockRejectedValueOnce(new Error('Retry 1'))
        .mockRejectedValueOnce(new Error('Retry 2'))
        .mockResolvedValueOnce({
          data: { id: 'event-123', status: 'confirmed' },
        });

      // Use fake timers to avoid real delays
      vi.useFakeTimers();

      const promise = syncPlanToGoogleCalendar(
        mockPlanId,
        createMockCalendarClient()
      );
      await vi.runAllTimersAsync();
      await promise;

      vi.useRealTimers();

      // Verify the sync completed successfully
      expect(mockCalendar.events.insert).toHaveBeenCalledTimes(3);
    });

    it('should surface integration error when all tasks fail', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task 1',
      } as any);

      // All retries fail
      mockCalendar.events.insert.mockRejectedValue(new Error('API Error'));

      await expect(
        syncPlanToGoogleCalendar(mockPlanId, createMockCalendarClient())
      ).rejects.toThrow(IntegrationSyncError);
    });

    it('should handle tasks with null descriptions', async () => {
      const mockPlan = {
        id: mockPlanId,
        userId: 'user-123',
        weeklyHours: 10,
      };
      const mockModules = [{ id: 'module-1', order: 1 }];
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: null,
          estimatedMinutes: 60,
        },
      ];

      mockDbSelect.limit
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValue([]);
      mockDbSelect.orderBy.mockResolvedValue(mockModules);
      mockDbSelect.where
        .mockReturnValueOnce(mockDbSelect)
        .mockReturnValueOnce(mockDbSelect)
        .mockResolvedValueOnce(mockTasks);

      const mockSchedule = new Map([
        ['task-1', new Date('2025-06-01T09:00:00Z')],
      ]);
      vi.mocked(mapper.generateSchedule).mockReturnValue(mockSchedule);

      vi.mocked(mapper.mapTaskToCalendarEvent).mockReturnValue({
        summary: 'Task 1',
      } as any);

      mockCalendar.events.insert.mockResolvedValue({
        data: { id: 'event-123', status: 'confirmed' },
      });

      const result = await syncPlanToGoogleCalendar(
        mockPlanId,
        createMockCalendarClient()
      );

      expect(result).toBe(1);
      expect(mapper.mapTaskToCalendarEvent).toHaveBeenCalledWith(
        {
          id: 'task-1',
          title: 'Task 1',
          description: null,
          estimatedMinutes: 60,
        },
        expect.any(Date)
      );
    });
  });
});
