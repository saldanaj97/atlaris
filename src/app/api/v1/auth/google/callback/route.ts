import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${error}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_parameters', request.url)
    );
  }

  // Verify user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, state))
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=invalid_user', request.url)
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
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
      new URL('/settings/integrations?google=connected', request.url)
    );
  } catch (err) {
    console.error('Google token exchange failed:', err);
    return NextResponse.redirect(
      new URL('/settings/integrations?error=token_exchange_failed', request.url)
    );
  }
}
