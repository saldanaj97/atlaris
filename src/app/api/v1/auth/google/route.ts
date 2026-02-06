import { googleOAuthEnv } from '@/lib/config/env';
import { generateAndStoreOAuthStateToken } from '@/lib/integrations/oauth-state';
import { logger } from '@/lib/logging/logger';
import { auth } from '@/lib/auth/server';
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

function getGoogleOAuthConfig() {
  try {
    return {
      clientId: googleOAuthEnv.clientId,
      clientSecret: googleOAuthEnv.clientSecret,
      redirectUri: googleOAuthEnv.redirectUri,
    };
  } catch (error) {
    logger.error({ error }, 'Google OAuth configuration error');
    return null;
  }
}

export async function GET(_request: NextRequest) {
  const { data: session } = await auth.getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = getGoogleOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured' },
      { status: 503 }
    );
  }

  const stateToken = await generateAndStoreOAuthStateToken(
    userId,
    'google_calendar'
  );

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: stateToken, // Use secure token instead of user ID
    prompt: 'consent', // Force consent to get refresh token
  });

  return NextResponse.redirect(authUrl);
}
