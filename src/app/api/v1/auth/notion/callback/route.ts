import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  // Verify user is authenticated
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    const baseUrl =
      request.nextUrl?.origin ||
      new URL(request.url).origin ||
      'http://localhost:3000';
    return NextResponse.redirect(
      new URL('/settings/integrations?error=unauthorized', baseUrl),
      { status: 302 }
    );
  }

  const url = request.nextUrl || new URL(request.url);
  const searchParams = url.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId
  const error = searchParams.get('error');

  // Extract origin from request URL for redirects
  const baseUrl =
    request.nextUrl?.origin ||
    new URL(request.url).origin ||
    'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${error}`, baseUrl),
      { status: 302 }
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_parameters', baseUrl),
      { status: 302 }
    );
  }

  // Verify user exists
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, state))
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=invalid_user', baseUrl),
      { status: 302 }
    );
  }

  // Verify the authenticated user matches the user in the state parameter
  if (user.clerkUserId !== clerkUserId) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=user_mismatch', baseUrl),
      { status: 302 }
    );
  }

  // Exchange code for access token
  const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(
        `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.NOTION_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    const errorData = (await tokenResponse.json()) as {
      error?: string;
      error_description?: string;
    };
    console.error('Notion token exchange failed:', errorData);
    return NextResponse.redirect(
      new URL('/settings/integrations?error=token_exchange_failed', baseUrl),
      { status: 302 }
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    bot_id: string;
    workspace_id: string;
    workspace_name: string;
    owner: { type: string };
  };

  // Store encrypted tokens
  try {
    await storeOAuthTokens({
      userId: user.id,
      provider: 'notion',
      tokenData: {
        accessToken: tokenData.access_token,
        scope: 'notion', // Notion doesn't use traditional scopes
      },
      workspaceId: tokenData.workspace_id,
      workspaceName: tokenData.workspace_name,
      botId: tokenData.bot_id,
    });
  } catch (error) {
    console.error('Failed to store OAuth tokens:', {
      userId: user.id,
      provider: 'notion',
      workspaceId: tokenData.workspace_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.redirect(
      new URL('/settings/integrations?error=token_storage_failed', baseUrl),
      { status: 302 }
    );
  }

  return NextResponse.redirect(
    new URL('/settings/integrations?notion=connected', baseUrl),
    { status: 302 }
  );
}
