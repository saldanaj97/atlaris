import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { google } from 'googleapis';
import { googleOAuthEnv } from '@/lib/config/env';
import {
  generateOAuthStateToken,
  storeOAuthStateToken,
} from '@/lib/integrations/oauth-state';

function getGoogleOAuthConfig() {
  try {
    return {
      clientId: googleOAuthEnv.clientId,
      clientSecret: googleOAuthEnv.clientSecret,
      redirectUri: googleOAuthEnv.redirectUri,
    };
  } catch (error) {
    return null;
  }
}

export async function GET(_request: NextRequest) {
  const { userId } = await auth();

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

  // Generate a cryptographically secure state token
  const stateToken = generateOAuthStateToken();
  // Store the mapping between state token and Clerk user ID
  storeOAuthStateToken(stateToken, userId);

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
