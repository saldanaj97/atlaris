## Task 6: Notion Integration - OAuth Authorization Flow

**API Key Note:** Before implementing this task, ensure you have:

- Created a Notion integration at https://www.notion.so/my-integrations
- Added NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI to `.env.local` and `.env.test`

**Files:**

- Create: `src/app/api/v1/auth/notion/route.ts`
- Create: `src/app/api/v1/auth/notion/callback/route.ts`
- Create: `tests/integration/notion-oauth.spec.ts`

**Step 1: Write failing test for OAuth redirect**

Create `tests/integration/notion-oauth.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GET as notionAuthGET } from '@/app/api/v1/auth/notion/route';
import { GET as notionCallbackGET } from '@/app/api/v1/auth/notion/callback/route';

describe('Notion OAuth Flow', () => {
  it('should redirect to Notion authorization URL', async () => {
    const request = new Request('http://localhost:3000/api/v1/auth/notion');
    const response = await notionAuthGET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain(
      'https://api.notion.com/v1/oauth/authorize'
    );
    expect(response.headers.get('Location')).toContain('client_id=');
    expect(response.headers.get('Location')).toContain('redirect_uri=');
    expect(response.headers.get('Location')).toContain('response_type=code');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/notion-oauth.spec.ts
```

Expected: FAIL - "Cannot find module"

**Step 3: Implement authorization redirect endpoint**

Create `src/app/api/v1/auth/notion/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri = process.env.NOTION_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Notion OAuth not configured' },
      { status: 500 }
    );
  }

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');

  // Store userId in state parameter for callback verification
  authUrl.searchParams.set('state', userId);

  return NextResponse.redirect(authUrl.toString());
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/notion-oauth.spec.ts
```

Expected: PASS

**Step 5: Implement OAuth callback endpoint (test first)**

Add to `tests/integration/notion-oauth.spec.ts`:

```typescript
import { db } from '@/lib/db/drizzle';
import { users, integrationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('Notion OAuth Callback', () => {
  it('should exchange code for tokens and store encrypted', async () => {
    // Mock Notion API token exchange
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'notion_access_token_123',
        bot_id: 'bot_abc',
        workspace_id: 'workspace_xyz',
        workspace_name: 'Test Workspace',
        owner: { type: 'user' },
      }),
    });

    // Create test user
    await db.delete(integrationTokens);
    await db.delete(users);
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'test_clerk_user',
        email: 'test@example.com',
      })
      .returning();

    const request = new Request(
      `http://localhost:3000/api/v1/auth/notion/callback?code=test_code&state=${user.id}`
    );

    const response = await notionCallbackGET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain(
      '/settings/integrations'
    );

    // Verify token stored
    const [token] = await db
      .select()
      .from(integrationTokens)
      .where(eq(integrationTokens.userId, user.id));

    expect(token).toBeDefined();
    expect(token.provider).toBe('notion');
    expect(token.workspaceId).toBe('workspace_xyz');
  });
});
```

**Step 6: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/notion-oauth.spec.ts
```

Expected: FAIL - Callback not implemented

**Step 7: Implement callback endpoint**

Create `src/app/api/v1/auth/notion/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
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

  // Verify user exists
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

  // Exchange code for access token
  const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(
        `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.NOTION_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json();
    console.error('Notion token exchange failed:', errorData);
    return NextResponse.redirect(
      new URL('/settings/integrations?error=token_exchange_failed', request.url)
    );
  }

  const tokenData = await tokenResponse.json();

  // Store encrypted tokens
  await storeOAuthTokens({
    userId: user.id,
    provider: 'notion',
    tokenData: {
      accessToken: tokenData.access_token,
      scope: 'notion', // Notion doesn't use traditional scopes
    },
    workspaceId: tokenData.workspace_id,
    workspaceName: tokenData.workspace_name,
    botId: tokenData.bot_id,
  });

  return NextResponse.redirect(
    new URL('/settings/integrations?notion=connected', request.url)
  );
}
```

**Step 8: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/notion-oauth.spec.ts
```

Expected: PASS - Both tests passing

**Step 9: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 10: Commit**

```bash
git add src/app/api/v1/auth/notion/ tests/integration/notion-oauth.spec.ts
git commit -m "feat(notion): implement OAuth 2.0 authorization flow

Add OAuth authorization redirect and callback endpoints for Notion
integration. Exchanges authorization code for access token and stores
encrypted in database with workspace metadata.

Changes:
- Add GET /api/v1/auth/notion (redirect to Notion OAuth)
- Add GET /api/v1/auth/notion/callback (token exchange)
- Store workspace_id, workspace_name, bot_id from Notion response
- Use state parameter to verify user identity

New files:
- src/app/api/v1/auth/notion/route.ts
- src/app/api/v1/auth/notion/callback/route.ts
- tests/integration/notion-oauth.spec.ts

Tests cover:
- Authorization redirect with correct parameters
- Callback token exchange and encrypted storage"
```

---
