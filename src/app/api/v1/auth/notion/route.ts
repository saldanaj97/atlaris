import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { notionEnv } from '@/lib/config/env';
import { generateAndStoreOAuthStateToken } from '@/lib/integrations/oauth-state';

export async function GET(_request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { clientId, redirectUri } = notionEnv;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Notion OAuth is not configured' },
      { status: 500 }
    );
  }

  const stateToken = await generateAndStoreOAuthStateToken(userId, 'notion');

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('state', stateToken);

  return NextResponse.redirect(authUrl.toString(), { status: 302 });
}
