import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  withAuth,
  withRateLimit,
  type RouteHandlerContext,
} from '@/lib/api/auth';
import { AppError, toErrorResponse } from '@/lib/api/errors';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, users } from '@/lib/db/schema';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { createGoogleCalendarClient } from '@/lib/integrations/google-calendar/factory';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';
import { and, eq } from 'drizzle-orm';

const syncRequestSchema = z.object({
  planId: z.string().uuid('Invalid plan ID format'),
});

const handleAuthedGoogleCalendarSync = withAuth(
  withRateLimit('integration')(async ({ req, userId: clerkUserId }) => {
    const request = req as NextRequest;
    const { requestId, logger } = createRequestContext(req, {
      route: 'google_calendar_sync',
      clerkUserId,
    });
    const respondJson = (payload: unknown, init?: ResponseInit) =>
      attachRequestIdHeader(NextResponse.json(payload, init), requestId);

    const respondAppError = (error: AppError) => {
      const body: Record<string, unknown> = {
        error: error.message,
        code: error.code(),
      };
      const classification = error.classification();
      if (classification) {
        body.classification = classification;
      }
      const details = error.details();
      if (details !== undefined) {
        body.details = details;
      }
      return respondJson(body, { status: error.status() });
    };

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);

    if (!user) {
      return respondJson({ error: 'User not found' }, { status: 404 });
    }

    // Temporarily disable Google Calendar sync until the feature is ready.
    return respondJson(
      { error: 'Google Calendar sync is currently disabled' },
      { status: 503 }
    );

    const googleTokens = await getOAuthTokens(user.id, 'google_calendar');
    if (!googleTokens) {
      return respondJson(
        { error: 'Google Calendar not connected' },
        { status: 401 }
      );
    }

    // Validate request body
    let body: z.infer<typeof syncRequestSchema>;
    try {
      const rawBody: unknown = await request.json();
      body = syncRequestSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return respondJson({ error: 'Invalid request' }, { status: 400 });
      }
      return respondJson({ error: 'Invalid request body' }, { status: 400 });
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
        return respondJson(
          { error: 'Plan not found or access denied' },
          { status: 404 }
        );
      }

      // Tier gate: check export quota for current subscription tier
      const canExport = await checkExportQuota(
        user.id,
        user.subscriptionTier,
        db
      );
      if (!canExport) {
        return respondJson(
          {
            error: 'Export quota exceeded',
            message: 'Upgrade your plan to export more learning plans',
          },
          { status: 403 }
        );
      }

      const calendarClient = createGoogleCalendarClient({
        accessToken: googleTokens!.accessToken,
        refreshToken: googleTokens!.refreshToken,
      });

      const eventsCreated = await syncPlanToGoogleCalendar(
        planId,
        calendarClient
      );

      // Increment usage after a successful sync (non-blocking)
      try {
        await incrementExportUsage(user.id, db);
      } catch (e) {
        logger.error(
          {
            userId: user.id,
            error: e,
          },
          'Failed to increment export usage for Google Calendar sync'
        );
        // Do not fail the request if usage tracking fails
      }
      return respondJson({ eventsCreated, success: true });
    } catch (error) {
      logger.error(
        {
          planId,
          userId: user.id,
          provider: 'google_calendar',
          error,
        },
        'Google Calendar sync failed'
      );

      if (error instanceof AppError) {
        return respondAppError(error as AppError);
      }

      return respondJson(
        {
          error: 'Google Calendar sync failed',
          code: 'GOOGLE_CALENDAR_SYNC_FAILED',
        },
        { status: 500 }
      );
    }
  })
);

export async function POST(
  req: Request,
  context?: RouteHandlerContext
): Promise<Response> {
  try {
    return await handleAuthedGoogleCalendarSync(req, context);
  } catch (error) {
    if (error instanceof AppError) {
      return toErrorResponse(error);
    }

    return Response.json(
      {
        error: 'Google Calendar sync failed',
        code: 'GOOGLE_CALENDAR_SYNC_FAILED',
      },
      { status: 500 }
    );
  }
}
