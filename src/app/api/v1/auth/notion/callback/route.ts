import { NextRequest, NextResponse } from 'next/server';
import { notionEnv } from '@/lib/config/env';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { withErrorBoundary } from '@/lib/api/auth';
import { getClerkAuthUserId } from '@/lib/api/auth';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { validateOAuthStateToken } from '@/lib/integrations/oauth-state';

export const GET = withErrorBoundary(async (req: Request) => {
  const request = req as NextRequest;

  // For OAuth callbacks we must validate against the actual Clerk session,
  // not the DEV_CLERK_USER_ID override used in tests and local dev.
  const clerkUserId = await getClerkAuthUserId();

  const { requestId, logger } = createRequestContext(req, {
    route: 'notion_oauth_callback',
    clerkUserId,
  });
  const redirectWithRequestId = (url: URL) =>
    attachRequestIdHeader(
      NextResponse.redirect(url, { status: 302 }),
      requestId
    );

  const url = request.nextUrl || new URL(request.url);
  const searchParams = url.searchParams;
  const code = searchParams.get('code');
  const stateToken = searchParams.get('state'); // Secure state token (not raw userId)
  const error = searchParams.get('error');

  // Extract origin from request URL for redirects
  const baseUrl =
    request.nextUrl?.origin ||
    new URL(request.url).origin ||
    'http://localhost:3000';

  // Handle provider error immediately
  if (error) {
    return redirectWithRequestId(
      new URL(`/settings/integrations?error=${error}`, baseUrl)
    );
  }

  if (!code || !stateToken) {
    return redirectWithRequestId(
      new URL('/settings/integrations?error=missing_parameters', baseUrl)
    );
  }

  const stateClerkUserId = await validateOAuthStateToken(stateToken);
  if (!stateClerkUserId) {
    return redirectWithRequestId(
      new URL('/settings/integrations?error=invalid_state', baseUrl)
    );
  }

  // Authenticate current user (redirect on unauthenticated instead of JSON).
  if (!clerkUserId) {
    return redirectWithRequestId(
      new URL('/settings/integrations?error=unauthorized', baseUrl)
    );
  }

  // Verify the authenticated user matches the user from the state token
  if (clerkUserId !== stateClerkUserId) {
    return redirectWithRequestId(
      new URL('/settings/integrations?error=user_mismatch', baseUrl)
    );
  }

  // Query users.clerkUserId to find the application user
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, stateClerkUserId))
    .limit(1);

  if (!user) {
    return redirectWithRequestId(
      new URL('/settings/integrations?error=invalid_user', baseUrl)
    );
  }

  // Exchange code for access token
  const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(
        `${notionEnv.clientId}:${notionEnv.clientSecret}`
      ).toString('base64')}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: notionEnv.redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const errorData = (await tokenResponse.json()) as {
      error?: string;
      error_description?: string;
    };
    logger.error(
      {
        error: errorData,
      },
      'Notion token exchange failed'
    );
    return redirectWithRequestId(
      new URL('/settings/integrations?error=token_exchange_failed', baseUrl)
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
  } catch (err) {
    logger.error(
      {
        userId: user.id,
        provider: 'notion',
        workspaceId: tokenData.workspace_id,
        error: err,
      },
      'Failed to store Notion OAuth tokens'
    );
    return redirectWithRequestId(
      new URL('/settings/integrations?error=token_storage_failed', baseUrl)
    );
  }

  return redirectWithRequestId(
    new URL('/settings/integrations?notion=connected', baseUrl)
  );
});
