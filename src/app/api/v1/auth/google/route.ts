import { NextResponse } from 'next/server';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { ServiceUnavailableError } from '@/lib/api/errors';
import { googleOAuthEnv } from '@/lib/config/env';
import { generateAndStoreOAuthStateToken } from '@/lib/integrations/oauth-state';
import { google } from 'googleapis';

function getGoogleOAuthConfig() {
  return {
    clientId: googleOAuthEnv.clientId,
    clientSecret: googleOAuthEnv.clientSecret,
    redirectUri: googleOAuthEnv.redirectUri,
  };
}

export const GET = withErrorBoundary(
  withAuthAndRateLimit('oauth', async ({ userId }) => {
    let config: ReturnType<typeof getGoogleOAuthConfig>;
    try {
      config = getGoogleOAuthConfig();
    } catch {
      throw new ServiceUnavailableError('Google OAuth is not configured', {
        provider: 'google_calendar',
      });
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
      state: stateToken,
      prompt: 'consent',
    });

    return NextResponse.redirect(authUrl);
  })
);
