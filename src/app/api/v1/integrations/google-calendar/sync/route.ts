import { NextResponse } from 'next/server';

import {
  withAuth,
  withRateLimit,
  type RouteHandlerContext,
} from '@/lib/api/auth';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';
import { eq } from 'drizzle-orm';

const handleAuthedGoogleCalendarSync = withAuth(
  withRateLimit('integration')(async ({ req, userId: authUserId }) => {
    const { requestId } = createRequestContext(req, {
      route: 'google_calendar_sync',
      authUserId,
    });

    const respondJson = (payload: unknown, init?: ResponseInit) =>
      attachRequestIdHeader(NextResponse.json(payload, init), requestId);

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, authUserId))
      .limit(1);

    if (!user) {
      return respondJson({ error: 'User not found' }, { status: 404 });
    }

    return respondJson(
      { error: 'Google Calendar sync is currently disabled' },
      { status: 503 }
    );
  })
);

export async function POST(
  req: Request,
  context?: RouteHandlerContext
): Promise<Response> {
  return handleAuthedGoogleCalendarSync(req, context);
}
