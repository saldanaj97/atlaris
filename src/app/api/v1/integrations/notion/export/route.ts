import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { exportPlanToNotion } from '@/lib/integrations/notion/sync';

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

  // Get Notion token
  const notionTokens = await getOAuthTokens(user.id, 'notion');
  if (!notionTokens) {
    return NextResponse.json(
      { error: 'Notion not connected' },
      { status: 401 }
    );
  }

  const body = (await request.json()) as { planId?: string };

  if (!body.planId || typeof body.planId !== 'string') {
    return NextResponse.json({ error: 'planId required' }, { status: 400 });
  }

  try {
    const notionPageId = await exportPlanToNotion(
      body.planId,
      notionTokens.accessToken
    );

    return NextResponse.json({ notionPageId, success: true });
  } catch (error) {
    console.error('Notion export failed:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
