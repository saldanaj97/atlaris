import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IntegrationSyncError,
  ValidationError,
  NotFoundError,
} from '@/lib/api/errors';
import { setTestUser, clearTestUser } from '../../helpers/auth';

// Mock dependencies before importing the route
vi.mock('@/lib/logging/logger', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  } as any;

  logger.child.mockReturnValue(logger);

  return {
    logger,
    createLogger: () => logger,
  };
});

// Mock getDb to return our mocked DB
const mockDbInstance = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
};

vi.mock('@/lib/db/runtime', () => ({
  getDb: vi.fn(() => mockDbInstance),
}));

vi.mock('@/lib/integrations/oauth', () => ({
  getOAuthTokens: vi.fn(),
}));

vi.mock('@/lib/integrations/google-calendar/sync', () => ({
  syncPlanToGoogleCalendar: vi.fn(),
}));

vi.mock('@/lib/integrations/google-calendar/factory', () => ({
  createGoogleCalendarClient: vi.fn(),
}));

describe.skip('Google Calendar Sync Route (temporarily disabled)', () => {
  let mockDb: any;
  let mockGetOAuthTokens: any;
  let mockSyncPlanToGoogleCalendar: any;
  let mockCreateGoogleCalendarClient: any;
  let mockCheckExportQuota: any;
  let mockIncrementExportUsage: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default to authenticated test user for routes that require it
    setTestUser('auth-user-123');

    // Import mocked functions
    const { getOAuthTokens } = await import('@/lib/integrations/oauth');
    const { syncPlanToGoogleCalendar } = await import(
      '@/lib/integrations/google-calendar/sync'
    );
    const { createGoogleCalendarClient } = await import(
      '@/lib/integrations/google-calendar/factory'
    );
    const usage = await import('@/lib/db/usage');

    mockGetOAuthTokens = vi.mocked(getOAuthTokens);
    mockSyncPlanToGoogleCalendar = vi.mocked(syncPlanToGoogleCalendar);
    mockCreateGoogleCalendarClient = vi.mocked(createGoogleCalendarClient);
    mockCheckExportQuota = vi
      .spyOn(usage, 'checkExportQuota')
      .mockResolvedValue(true);
    mockIncrementExportUsage = vi
      .spyOn(usage, 'incrementExportUsage')
      .mockResolvedValue(undefined);

    // Setup a mock Google Calendar client object
    const mockCalendarClient = {
      events: {
        insert: vi.fn(),
        delete: vi.fn(),
      },
    };
    mockCreateGoogleCalendarClient.mockReturnValue(mockCalendarClient);

    // Setup db mock chain - use mockDbInstance instead
    mockDb = mockDbInstance;
    mockDb.from.mockReturnThis();
    mockDb.select.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockReturnThis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.skip('POST /api/v1/integrations/google-calendar/sync', () => {
    it('should return 401 when user is not authenticated', async () => {
      clearTestUser();

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when user is not found in database', async () => {
      mockDb.limit.mockResolvedValue([]);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('should return 401 when Google Calendar is not connected', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue(null);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Google Calendar not connected');
    });

    it('should return 400 when planId is missing', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('should return 400 when planId is not a valid UUID', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: 'not-a-uuid' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
      expect(data.details).toBeDefined();
    });

    it('should return 400 when request body is invalid JSON', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid-json',
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request body');
    });

    it('should return 200 with success when sync completes', async () => {
      mockDb.limit.mockResolvedValue([
        { id: 'user-123', subscriptionTier: 'free' },
      ]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });
      mockSyncPlanToGoogleCalendar.mockResolvedValue(5);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.eventsCreated).toBe(5);
      expect(mockCheckExportQuota).toHaveBeenCalledWith('user-123', 'free');
      expect(mockIncrementExportUsage).toHaveBeenCalledWith('user-123');
    });

    it('should call syncPlanToGoogleCalendar with correct parameters', async () => {
      const planId = '123e4567-e89b-12d3-a456-426614174000';
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });
      mockSyncPlanToGoogleCalendar.mockResolvedValue(3);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        }
      );

      await POST(request);

      // Verify the factory was called with the correct tokens
      expect(mockCreateGoogleCalendarClient).toHaveBeenCalledWith({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });

      // Verify syncPlanToGoogleCalendar was called with planId and the client object
      expect(mockSyncPlanToGoogleCalendar).toHaveBeenCalledWith(
        planId,
        expect.objectContaining({
          events: expect.objectContaining({
            insert: expect.any(Function),
            delete: expect.any(Function),
          }),
        })
      );
    });

    it('should return 500 with explicit error when sync fails with unexpected error', async () => {
      mockDb.limit.mockResolvedValue([
        { id: 'user-123', subscriptionTier: 'free' },
      ]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });
      mockSyncPlanToGoogleCalendar.mockRejectedValue(new Error('Sync failed'));

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Google Calendar sync failed');
      expect(data.code).toBe('GOOGLE_CALENDAR_SYNC_FAILED');
      expect(mockCheckExportQuota).toHaveBeenCalledWith('user-123', 'free');
      expect(mockIncrementExportUsage).not.toHaveBeenCalled();
    });

    it('should return 403 and skip sync when export quota is exceeded', async () => {
      mockDb.limit.mockResolvedValue([
        { id: 'user-123', subscriptionTier: 'free' },
      ]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });
      mockSyncPlanToGoogleCalendar.mockResolvedValue(5);
      mockCheckExportQuota.mockResolvedValueOnce(false);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Export quota exceeded');
      expect(mockCheckExportQuota).toHaveBeenCalledWith('user-123', 'free');
      expect(mockSyncPlanToGoogleCalendar).not.toHaveBeenCalled();
      expect(mockIncrementExportUsage).not.toHaveBeenCalled();
    });

    it('should handle planId with different UUID formats', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      mockSyncPlanToGoogleCalendar.mockResolvedValue(1);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        '00000000-0000-0000-0000-000000000000',
      ];

      for (const uuid of validUUIDs) {
        const request = new NextRequest(
          'http://localhost:3000/api/v1/integrations/google-calendar/sync',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: uuid }),
          }
        );

        const response = await POST(request);
        expect(response.status).toBe(200);
      }
    });

    it('should reject invalid UUID formats', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const invalidUUIDs = [
        'not-a-uuid',
        '123',
        '123e4567-e89b-12d3-a456',
        '123e4567-e89b-12d3-a456-426614174000-extra',
        '',
      ];

      for (const uuid of invalidUUIDs) {
        const request = new NextRequest(
          'http://localhost:3000/api/v1/integrations/google-calendar/sync',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: uuid }),
          }
        );

        const response = await POST(request);
        expect(response.status).toBe(400);
      }
    });

    it('should handle OAuth tokens without refresh token', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: undefined,
      });
      mockSyncPlanToGoogleCalendar.mockResolvedValue(2);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify the factory was called with undefined refresh token
      expect(mockCreateGoogleCalendarClient).toHaveBeenCalledWith({
        accessToken: 'test-token',
        refreshToken: undefined,
      });

      // Verify syncPlanToGoogleCalendar was called with planId and the client object
      expect(mockSyncPlanToGoogleCalendar).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        expect.objectContaining({
          events: expect.objectContaining({
            insert: expect.any(Function),
            delete: expect.any(Function),
          }),
        })
      );
    });

    it('should include Zod validation details in error response', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: 12345 }), // Number instead of string
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
      expect(data.details).toBeDefined();
      expect(Array.isArray(data.details)).toBe(true);
    });

    it('should return eventsCreated count of 0 when no events are synced', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });
      mockSyncPlanToGoogleCalendar.mockResolvedValue(0);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.eventsCreated).toBe(0);
    });

    it('should log errors via structured logger', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });

      const error = new Error('Test sync error');
      mockSyncPlanToGoogleCalendar.mockRejectedValue(error);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      await POST(request);
      const { logger: mockLogger } = await import('@/lib/logging/logger');
      const errorSpy = vi.mocked(mockLogger.error);

      expect(errorSpy).toHaveBeenCalled();
      const lastCall = errorSpy.mock.calls[errorSpy.mock.calls.length - 1];
      expect(lastCall[1]).toBe('Google Calendar sync failed');
      expect(lastCall[0]).toMatchObject({ error });
    });

    it('should handle extra fields in request body gracefully', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      mockSyncPlanToGoogleCalendar.mockResolvedValue(1);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
            extraField: 'should be ignored',
            anotherField: 123,
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should surface AppError details from sync service', async () => {
      mockDb.limit.mockResolvedValue([
        { id: 'user-123', subscriptionTier: 'free' },
      ]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });

      const appError = new IntegrationSyncError('Google Calendar sync failed', {
        taskErrors: [{ taskId: 'task-1', error: 'Some failure' }],
      });
      mockSyncPlanToGoogleCalendar.mockRejectedValue(appError);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Google Calendar sync failed');
      expect(data.code).toBe('GOOGLE_CALENDAR_SYNC_FAILED');
      expect(data.details).toEqual({
        taskErrors: [{ taskId: 'task-1', error: 'Some failure' }],
      });
    });

    it('should return 400 when sync service raises ValidationError', async () => {
      mockDb.limit.mockResolvedValue([
        { id: 'user-123', subscriptionTier: 'free' },
      ]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });
      const validationError = new ValidationError('Plan state invalid', {
        issues: [{ path: ['weeklyHours'], message: 'Too low' }],
      });
      mockSyncPlanToGoogleCalendar.mockRejectedValue(validationError);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Plan state invalid');
      expect(data.code).toBe('VALIDATION_ERROR');
      expect(data.details).toEqual({
        issues: [{ path: ['weeklyHours'], message: 'Too low' }],
      });
      expect(data.classification).toBe('validation');
    });

    it('should return 404 when sync service raises NotFoundError', async () => {
      mockDb.limit.mockResolvedValue([
        { id: 'user-123', subscriptionTier: 'free' },
      ]);
      mockGetOAuthTokens.mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      });
      const notFoundError = new NotFoundError('Plan not found in sync service');
      mockSyncPlanToGoogleCalendar.mockRejectedValue(notFoundError);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Plan not found in sync service');
      expect(data.code).toBe('NOT_FOUND');
    });
  });
});
