import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Mock dependencies before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
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
  let mockAuth: any;
  let mockDb: any;
  let mockGetOAuthTokens: any;
  let mockSyncPlanToGoogleCalendar: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked functions
    const { auth } = await import('@clerk/nextjs/server');
    const { db } = await import('@/lib/db/drizzle');
    const { getOAuthTokens } = await import('@/lib/integrations/oauth');
    const { syncPlanToGoogleCalendar } = await import(
      '@/lib/integrations/google-calendar/sync'
    );

    mockAuth = vi.mocked(auth);
    mockGetOAuthTokens = vi.mocked(getOAuthTokens);
    mockSyncPlanToGoogleCalendar = vi.mocked(syncPlanToGoogleCalendar);

    // Setup db mock
    mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
    vi.mocked(db.select).mockReturnValue(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/integrations/google-calendar/sync', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: '123e4567-e89b-12d3-a456-426614174000' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when user is not found in database', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
      mockDb.limit.mockResolvedValue([]);

      const { POST } = await import(
        '@/app/api/v1/integrations/google-calendar/sync/route'
      );

      const request = new NextRequest(
        'http://localhost:3000/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: '123e4567-e89b-12d3-a456-426614174000' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('should return 401 when Google Calendar is not connected', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
          body: JSON.stringify({ planId: '123e4567-e89b-12d3-a456-426614174000' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Google Calendar not connected');
    });

    it('should return 400 when planId is missing', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
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
          body: JSON.stringify({ planId: '123e4567-e89b-12d3-a456-426614174000' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.eventsCreated).toBe(5);
    });

    it('should call syncPlanToGoogleCalendar with correct parameters', async () => {
      const planId = '123e4567-e89b-12d3-a456-426614174000';
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
      mockDb.limit.mockResolvedValue([{ id: 'user-123' }]);
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
          body: JSON.stringify({ planId: '123e4567-e89b-12d3-a456-426614174000' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Sync failed');
    });

    it('should handle planId with different UUID formats', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
          body: JSON.stringify({ planId: '123e4567-e89b-12d3-a456-426614174000' }),
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
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
          body: JSON.stringify({ planId: '123e4567-e89b-12d3-a456-426614174000' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.eventsCreated).toBe(0);
    });

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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
          body: JSON.stringify({ planId: '123e4567-e89b-12d3-a456-426614174000' }),
        }
      );

      await POST(request);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Google Calendar sync failed:',
        error
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle extra fields in request body gracefully', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-user-123' });
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