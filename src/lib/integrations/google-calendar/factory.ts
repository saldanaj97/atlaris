import { google } from 'googleapis';
import { googleOAuthEnv } from '@/lib/config/env';
import type { GoogleCalendarClient } from './types';

interface GoogleTokens {
  accessToken: string;
  refreshToken?: string | null;
}

/**
 * Constructs a real Google Calendar client from env + user tokens.
 * This is the ONLY place that knows about googleapis + env.
 */
export function createGoogleCalendarClient(
  tokens: GoogleTokens
): GoogleCalendarClient {
  const clientId = googleOAuthEnv.clientId;
  const clientSecret = googleOAuthEnv.clientSecret;
  const redirectUri = googleOAuthEnv.redirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth environment variables are not configured for this runtime.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? undefined,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  return {
    events: {
      insert: (params) => calendar.events.insert(params as any),
      delete: (params) => calendar.events.delete(params as any).then(() => {}),
    },
  };
}
