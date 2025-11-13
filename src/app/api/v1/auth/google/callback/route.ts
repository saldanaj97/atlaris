import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { googleOAuthEnv } from '@/lib/config/env';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { validateOAuthStateToken } from '@/lib/integrations/oauth-state';
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const GET = withErrorBoundary(
  withAuth(async ({ req, userId: clerkUserId }) => {
    const request = req as NextRequest;
    const { requestId, logger } = createRequestContext(req, {
      route: 'google_oauth_callback',
      clerkUserId,
    });
    const redirectWithRequestId = (url: URL) =>
      attachRequestIdHeader(NextResponse.redirect(url), requestId);

    // Validate required Google OAuth environment variables
    const { clientId, clientSecret, redirectUri } = googleOAuthEnv;
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const stateToken = searchParams.get('state'); // Secure state token
    const error = searchParams.get('error');

    const baseUrl =
      request.nextUrl?.origin ||
      new URL(request.url).origin ||
      'http://localhost:3000';

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

    // Validate the state token and retrieve the associated Clerk user ID
    const stateClerkUserId = validateOAuthStateToken(stateToken);
    if (!stateClerkUserId) {
      return redirectWithRequestId(
        new URL('/settings/integrations?error=invalid_state', baseUrl)
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

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    try {
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      await storeOAuthTokens({
        userId: user.id,
        provider: 'google_calendar',
        tokenData: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? undefined,
          expiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : undefined,
          scope: tokens.scope || 'calendar',
        },
      });

      return redirectWithRequestId(
        new URL('/settings/integrations?google=connected', baseUrl)
      );
    } catch (err) {
      logger.error({ error: err }, 'Google token exchange failed');
      return redirectWithRequestId(
        new URL('/settings/integrations?error=token_exchange_failed', baseUrl)
      );
    }
  })
);
