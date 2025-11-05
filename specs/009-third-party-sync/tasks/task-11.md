## Task 11: Google Calendar Integration - OAuth Flow

**API Key Note:** Before implementing this task, ensure you have:

- Created Google Cloud project and enabled Calendar API
- Created OAuth 2.0 credentials
- Added GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI to `.env.local` and `.env.test`

**Files:**

- Create: `src/app/api/v1/auth/google/route.ts`
- Create: `src/app/api/v1/auth/google/callback/route.ts`
- Create: `tests/integration/google-oauth.spec.ts`

**Step 1: Write failing test for Google OAuth**

Create `tests/integration/google-oauth.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GET as googleAuthGET } from '@/app/api/v1/auth/google/route';

describe('Google OAuth Flow', () => {
  it('should redirect to Google authorization URL', async () => {
    const request = new Request('http://localhost:3000/api/v1/auth/google');
    const response = await googleAuthGET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain(
      'accounts.google.com/o/oauth2/v2/auth'
    );
    expect(response.headers.get('Location')).toContain('scope=');
    expect(response.headers.get('Location')).toContain('calendar');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/google-oauth.spec.ts
```

Expected: FAIL

**Step 3: Install googleapis**

Run:

```bash
pnpm add googleapis
```

Expected: Package installed

**Step 4: Implement Google OAuth endpoints**

Create `src/app/api/v1/auth/google/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: userId,
    prompt: 'consent', // Force consent to get refresh token
  });

  return NextResponse.redirect(authUrl);
}
```

Create `src/app/api/v1/auth/google/callback/route.ts`:

```typescript
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
        refreshToken: tokens.refresh_token,
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
```

**Step 5: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/google-oauth.spec.ts
```

Expected: PASS

**Step 6: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 7: Commit**

```bash
git add src/app/api/v1/auth/google/ tests/integration/google-oauth.spec.ts package.json pnpm-lock.yaml
git commit -m "feat(google): implement OAuth 2.0 authorization flow

Add Google Calendar OAuth endpoints with offline access for refresh
tokens. Exchanges authorization code and stores encrypted tokens.

Changes:
- Add GET /api/v1/auth/google (redirect to Google OAuth)
- Add GET /api/v1/auth/google/callback (token exchange)
- Request offline access and calendar scopes
- Install googleapis package

New files:
- src/app/api/v1/auth/google/route.ts
- src/app/api/v1/auth/google/callback/route.ts
- tests/integration/google-oauth.spec.ts

Tests cover:
- Authorization redirect with calendar scopes"
```

---
