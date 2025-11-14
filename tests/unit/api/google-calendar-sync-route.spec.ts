import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTestUser } from '../../helpers/auth';

// Shared logger mock to capture error logs
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as any;
mockLogger.child.mockReturnValue(mockLogger);

// Mock dependencies before importing the route
vi.mock('@/lib/logging/logger', () => ({
  logger: mockLogger,
  createLogger: () => mockLogger,
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/integrations/oauth', () => ({
  getOAuthTokens: vi.fn(),
}));

vi.mock('@/lib/integrations/google-calendar/sync', () => ({
  syncPlanToGoogleCalendar: vi.fn(),
}));

describe('Google Calendar Sync Route', () => {
  let mockDb: any;
  let mockGetOAuthTokens: any;
  let mockSyncPlanToGoogleCalendar: any;
  let mockCheckExportQuota: any;
  let mockIncrementExportUsage: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default to authenticated test user for routes that require it
    setTestUser('clerk-user-123');

    // Import mocked functions
    const { db } = await import('@/lib/db/drizzle');
    const { getOAuthTokens } = await import('@/lib/integrations/oauth');
    const { syncPlanToGoogleCalendar } = await import(
      '@/lib/integrations/google-calendar/sync'
    );
    const usage = await import('@/lib/db/usage');

    mockGetOAuthTokens = vi.mocked(getOAuthTokens);
    mockSyncPlanToGoogleCalendar = vi.mocked(syncPlanToGoogleCalendar);
    mockCheckExportQuota = vi
      .spyOn(usage, 'checkExportQuota')
      .mockResolvedValue(true);
    mockIncrementExportUsage = vi
      .spyOn(usage, 'incrementExportUsage')
      .mockResolvedValue(undefined);

    // Setup db mock
    mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/integrations/google-calendar/sync', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Simulate unauthenticated request by clearing DEV_CLERK_USER_ID override
      delete process.env.DEV_CLERK_USER_ID;

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

      expect(mockSyncPlanToGoogleCalendar).toHaveBeenCalledWith(
        planId,
        'test-token',
        'test-refresh'
      );
    });

    it('should return 500 when sync fails', async () => {
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
      expect(data.error).toBe('Sync failed');
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

      expect(mockSyncPlanToGoogleCalendar).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        'test-token',
        undefined
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

      expect(mockLogger.error).toHaveBeenCalled();
      const lastCall =
        mockLogger.error.mock.calls[mockLogger.error.mock.calls.length - 1];
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
  });
});
