import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';

const syncRequestSchema = z.object({
  planId: z.string().uuid('Invalid plan ID format'),
});

export const POST = withErrorBoundary(
  withAuth(async ({ req, userId: clerkUserId }) => {
    const request = req as NextRequest;
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const googleTokens = await getOAuthTokens(user.id, 'google_calendar');
    if (!googleTokens) {
      return NextResponse.json(
        { error: 'Google Calendar not connected' },
        { status: 401 }
      );
    }

    // Validate request body
    let body;
    try {
      const rawBody: unknown = await request.json();
      body = syncRequestSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid request', details: error.issues },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { planId } = body;

    try {
      // Ownership validation: ensure plan belongs to the authenticated user
      const [plan] = await db
        .select({ id: learningPlans.id })
        .from(learningPlans)
        .where(
          and(eq(learningPlans.id, planId), eq(learningPlans.userId, user.id))
        )
        .limit(1);

      if (!plan) {
        return NextResponse.json(
          { error: 'Plan not found or access denied' },
          { status: 404 }
        );
      }

      // Tier gate: check export quota for current subscription tier
      const canExport = await checkExportQuota(user.id, user.subscriptionTier);
      if (!canExport) {
        return NextResponse.json(
          {
            error: 'Export quota exceeded',
            message: 'Upgrade your plan to export more learning plans',
          },
          { status: 403 }
        );
      }

      const eventsCreated = await syncPlanToGoogleCalendar(
        planId,
        googleTokens.accessToken,
        googleTokens.refreshToken
      );

      // Increment usage after a successful sync (non-blocking)
      try {
        await incrementExportUsage(user.id);
      } catch (e) {
        console.error(
          'Failed to increment export usage for Google Calendar sync',
          {
            userId: user.id,
            error: e,
          }
        );
        // Do not fail the request if usage tracking fails
      }
      return NextResponse.json({ eventsCreated, success: true });
    } catch (error) {
      console.error('Google Calendar sync failed:', error);
      return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
    }
  })
);
