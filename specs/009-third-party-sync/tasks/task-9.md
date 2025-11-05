## Task 9: Notion Integration - Export Endpoint

**Files:**

- Create: `src/app/api/v1/integrations/notion/export/route.ts`
- Create: `src/lib/integrations/notion/sync.ts`
- Create: `tests/integration/notion-export.spec.ts`

**Step 1: Write failing test for export endpoint**

Create `tests/integration/notion-export.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/v1/integrations/notion/export/route';
import { db } from '@/lib/db/drizzle';
import {
  users,
  learningPlans,
  modules,
  tasks,
  integrationTokens,
} from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';

describe('Notion Export API', () => {
  let testUserId: string;
  let testPlanId: string;

  beforeEach(async () => {
    await db.delete(tasks);
    await db.delete(modules);
    await db.delete(learningPlans);
    await db.delete(integrationTokens);
    await db.delete(users);

    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk_test_${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
      })
      .returning();
    testUserId = user.id;

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        generationStatus: 'ready',
      })
      .returning();
    testPlanId = plan.id;

    // Store Notion token
    await storeOAuthTokens({
      userId: testUserId,
      provider: 'notion',
      tokenData: { accessToken: 'test_token', scope: 'notion' },
    });
  });

  it('should export plan to Notion and return page ID', async () => {
    // Mock Notion API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'notion_page_123' }),
    });

    const request = new Request(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: testPlanId }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notionPageId).toBe('notion_page_123');
  });

  it('should return 401 if no Notion token found', async () => {
    await db.delete(integrationTokens);

    const request = new Request(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        body: JSON.stringify({ planId: testPlanId }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/notion-export.spec.ts
```

Expected: FAIL - Module not found

**Step 3: Create sync utility module**

Create `src/lib/integrations/notion/sync.ts`:

```typescript
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  modules,
  tasks,
  notionSyncState,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NotionClient } from './client';
import { mapFullPlanToBlocks } from './mapper';
import { createHash } from 'node:crypto';

export async function exportPlanToNotion(
  planId: string,
  accessToken: string
): Promise<string> {
  // Fetch plan with modules and tasks
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found');
  }

  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(modules.order);

  const planTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.moduleId, planModules[0]?.id ?? ''));

  // Combine data
  const fullPlan = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: planTasks.filter((t) => t.moduleId === mod.id),
    })),
  };

  // Map to Notion blocks
  const blocks = mapFullPlanToBlocks(fullPlan as any);

  // Create Notion page
  const client = new NotionClient(accessToken);
  const notionPage = await client.createPage({
    parent: {
      type: 'page_id',
      page_id: process.env.NOTION_PARENT_PAGE_ID || '',
    },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: plan.topic } }],
      },
    },
    children: blocks,
  });

  // Calculate content hash for delta sync
  const contentHash = createHash('sha256')
    .update(JSON.stringify(fullPlan))
    .digest('hex');

  // Store sync state
  await db.insert(notionSyncState).values({
    planId,
    userId: plan.userId,
    notionPageId: notionPage.id,
    syncHash: contentHash,
    lastSyncedAt: new Date(),
  });

  return notionPage.id;
}
```

**Step 4: Create export API endpoint**

Create `src/app/api/v1/integrations/notion/export/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { exportPlanToNotion } from '@/lib/integrations/notion/sync';

export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Get Notion token
  const notionTokens = await getOAuthTokens(user.id, 'notion');
  if (!notionTokens) {
    return NextResponse.json(
      { error: 'Notion not connected' },
      { status: 401 }
    );
  }

  const { planId } = await request.json();

  if (!planId) {
    return NextResponse.json({ error: 'planId required' }, { status: 400 });
  }

  try {
    const notionPageId = await exportPlanToNotion(
      planId,
      notionTokens.accessToken
    );

    return NextResponse.json({ notionPageId, success: true });
  } catch (error) {
    console.error('Notion export failed:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
```

**Step 5: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/notion-export.spec.ts
```

Expected: PASS

**Step 6: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 7: Commit**

```bash
git add src/app/api/v1/integrations/notion/export/ src/lib/integrations/notion/sync.ts tests/integration/notion-export.spec.ts
git commit -m "feat(notion): add full plan export endpoint

Implement POST /api/v1/integrations/notion/export to create Notion page
from learning plan. Calculates content hash for delta sync tracking.

Changes:
- Add exportPlanToNotion utility function
- Add POST /api/v1/integrations/notion/export endpoint
- Store sync state with SHA-256 content hash
- Verify Notion OAuth token before export

New files:
- src/app/api/v1/integrations/notion/export/route.ts
- src/lib/integrations/notion/sync.ts
- tests/integration/notion-export.spec.ts

Tests cover:
- Successful export with page ID returned
- 401 error when no Notion token found"
```

---
