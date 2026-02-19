import { getAuthUserId, withErrorBoundary } from '@/lib/api/auth';
import {
  createRequestContext as createApiRequestContext,
  withRequestContext,
} from '@/lib/api/context';
import { ValidationError, toErrorResponse } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { googleOAuthEnv } from '@/lib/config/env';
import { createAuthenticatedRlsClient } from '@/lib/db/rls';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { validateOAuthStateToken } from '@/lib/integrations/oauth-state';
import {
  attachRequestIdHeader,
  createRequestContext as createLoggingRequestContext,
} from '@/lib/logging/request-context';
import { eq } from 'drizzle-orm';
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const GoogleTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expiry_date: z.number().finite().optional(),
  scope: z.string().min(1).optional(),
});

/** OAuth 2.0 / Google error values we allow through to the frontend (RFC 6749 + Google). */
const ALLOWED_OAUTH_ERROR_CODES = new Set([
  'access_denied',
  'invalid_grant',
  'invalid_request',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
  'unauthorized_client',
]);

export const GET = withErrorBoundary(async (req) => {
  const request = req as NextRequest;

  try {
    checkIpRateLimit(req, 'auth');
  } catch (error) {
    return toErrorResponse(error);
  }

  // For OAuth callbacks we must validate against the actual auth session,
  // not the DEV_AUTH_USER_ID override used in tests and local dev.
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=unauthenticated', request.url)
    );
  }

  const { requestId, logger } = createLoggingRequestContext(req, {
    route: 'google_oauth_callback',
    authUserId,
  });
  const redirectWithRequestId = (url: URL) =>
    attachRequestIdHeader(NextResponse.redirect(url), requestId);

  // Access Google OAuth environment variables (will throw if missing)
  const { clientId, clientSecret, redirectUri } = googleOAuthEnv;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateToken = searchParams.get('state'); // Secure state token
  const error = searchParams.get('error');

  const resolvedBaseUrl = request.nextUrl.origin || new URL(request.url).origin;
  const baseUrl =
    resolvedBaseUrl && resolvedBaseUrl !== 'null' ? resolvedBaseUrl : null;

  if (!baseUrl) {
    throw new Error('Unable to resolve Google OAuth callback base URL.');
  }

  if (error) {
    const sanitizedError =
      typeof error === 'string' && ALLOWED_OAUTH_ERROR_CODES.has(error)
        ? error
        : 'oauth_error';
    return redirectWithRequestId(
      new URL(`/settings/integrations?error=${sanitizedError}`, baseUrl)
    );
  }

  if (!code || !stateToken) {
    return redirectWithRequestId(
      new URL('/settings/integrations?error=missing_parameters', baseUrl)
    );
  }

  const stateAuthUserId = await validateOAuthStateToken(stateToken);
  if (!stateAuthUserId) {
    return redirectWithRequestId(
      new URL('/settings/integrations?error=invalid_state', baseUrl)
    );
  }

  // Verify the authenticated user matches the user from the state token
  if (authUserId !== stateAuthUserId) {
    return redirectWithRequestId(
      new URL('/settings/integrations?error=user_mismatch', baseUrl)
    );
  }

  const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(authUserId);
  const apiRequestContext = createApiRequestContext(req, {
    userId: authUserId,
    db: rlsDb,
    cleanup,
  });

  try {
    const [user] = await withRequestContext(apiRequestContext, () => {
      const db = getDb();
      return db
        .select()
        .from(users)
        .where(eq(users.authUserId, authUserId))
        .limit(1);
    });

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

    const { tokens: tokensRaw } = await oauth2Client.getToken(code);
    const parsedTokens = GoogleTokensSchema.safeParse(tokensRaw);
    if (!parsedTokens.success) {
      logger.error(
        {
          error: parsedTokens.error.flatten(),
        },
        'Invalid Google OAuth token response payload'
      );
      throw new ValidationError(
        'Google OAuth token response validation failed',
        parsedTokens.error.flatten()
      );
    }

    const tokens = parsedTokens.data;
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token ?? undefined;
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : undefined;

    await withRequestContext(apiRequestContext, () =>
      storeOAuthTokens({
        userId: user.id,
        provider: 'google_calendar',
        tokenData: {
          accessToken,
          refreshToken,
          expiresAt,
          scope: tokens.scope ?? 'calendar',
        },
      })
    );

    return redirectWithRequestId(
      new URL('/settings/integrations?google=connected', baseUrl)
    );
  } catch (err) {
    logger.error({ error: err }, 'Google token exchange failed');
    return redirectWithRequestId(
      new URL('/settings/integrations?error=token_exchange_failed', baseUrl)
    );
  } finally {
    await cleanup();
  }
});
