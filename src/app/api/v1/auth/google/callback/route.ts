import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { google } from 'googleapis';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { validateOAuthStateToken } from '@/lib/integrations/oauth-state';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  // Validate required Google OAuth environment variables
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    console.error('Missing required Google OAuth environment variables:', {
      GOOGLE_CLIENT_ID: !!clientId,
      GOOGLE_CLIENT_SECRET: !!clientSecret,
      GOOGLE_REDIRECT_URI: !!redirectUri,
    });
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_env_vars', request.url)
    );
  }

  // Load Clerk session and require authenticated session
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

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateToken = searchParams.get('state'); // Secure state token
  const error = searchParams.get('error');

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

  if (!code || !stateToken) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_parameters', baseUrl),
      { status: 302 }
    );
  }

  // Validate the state token and retrieve the associated Clerk user ID
  const stateClerkUserId = validateOAuthStateToken(stateToken);
  if (!stateClerkUserId) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=invalid_state', baseUrl),
      { status: 302 }
    );
  }

  // Verify the authenticated user matches the user from the state token
  if (clerkUserId !== stateClerkUserId) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=user_mismatch', baseUrl),
      { status: 302 }
    );
  }

  // Query users.clerkUserId to find the application user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, stateClerkUserId))
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=invalid_user', baseUrl),
      { status: 302 }
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

    return NextResponse.redirect(
      new URL('/settings/integrations?google=connected', baseUrl),
      { status: 302 }
    );
  } catch (err) {
    console.error('Google token exchange failed:', err);
    return NextResponse.redirect(
      new URL('/settings/integrations?error=token_exchange_failed', baseUrl),
      { status: 302 }
    );
  }
}
