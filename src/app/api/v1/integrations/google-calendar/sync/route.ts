import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';

const syncRequestSchema = z.object({
  planId: z.string().uuid('Invalid plan ID format'),
});

export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    const eventsCreated = await syncPlanToGoogleCalendar(
      planId,
      googleTokens.accessToken,
      googleTokens.refreshToken
    );

    return NextResponse.json({ eventsCreated, success: true });
  } catch (error) {
    console.error('Google Calendar sync failed:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
