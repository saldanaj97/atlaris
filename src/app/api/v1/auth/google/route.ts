import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { google } from 'googleapis';
import { googleOAuthEnv } from '@/lib/config/env';
import {
  generateOAuthStateToken,
  storeOAuthStateToken,
} from '@/lib/integrations/oauth-state';

export async function GET(_request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Generate a cryptographically secure state token
  const stateToken = generateOAuthStateToken();
  // Store the mapping between state token and Clerk user ID
  storeOAuthStateToken(stateToken, userId);

  const oauth2Client = new google.auth.OAuth2(
    googleOAuthEnv.clientId,
    googleOAuthEnv.clientSecret,
    googleOAuthEnv.redirectUri
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
