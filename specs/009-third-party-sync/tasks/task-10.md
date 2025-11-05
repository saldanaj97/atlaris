## Task 10: Notion Integration - Delta Sync

**Files:**

- Modify: `src/lib/integrations/notion/sync.ts`
- Create: `tests/integration/notion-delta-sync.spec.ts`

**Step 1: Write failing test for delta sync**

Create `tests/integration/notion-delta-sync.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { notionSyncState, learningPlans } from '@/lib/db/schema';
import { deltaSyncPlanToNotion } from '@/lib/integrations/notion/sync';

describe('Notion Delta Sync', () => {
  it('should detect changes via content hash', async () => {
    const planId = 'test-plan-123';
    const userId = 'test-user-123';

    // Create initial sync state
    await db.insert(notionSyncState).values({
      planId,
      userId,
      notionPageId: 'notion_page_123',
      syncHash: 'old_hash',
      lastSyncedAt: new Date('2025-01-01'),
    });

    // Mock Notion API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'notion_page_123' }),
    });

    const hasChanges = await deltaSyncPlanToNotion(planId, 'test_token');

    expect(hasChanges).toBe(true);
  });

  it('should skip sync if no changes detected', async () => {
    const planId = 'test-plan-456';
    const userId = 'test-user-456';

    // Create sync state with current hash
    const currentHash = 'current_hash_123';
    await db.insert(notionSyncState).values({
      planId,
      userId,
      notionPageId: 'notion_page_456',
      syncHash: currentHash,
      lastSyncedAt: new Date(),
    });

    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const hasChanges = await deltaSyncPlanToNotion(planId, 'test_token');

    expect(hasChanges).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/notion-delta-sync.spec.ts
```

Expected: FAIL - Function not found

**Step 3: Add delta sync function**

Edit `src/lib/integrations/notion/sync.ts`, add:

```typescript
import { createHash } from 'node:crypto';

function calculatePlanHash(plan: any): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

export async function deltaSyncPlanToNotion(
  planId: string,
  accessToken: string
): Promise<boolean> {
  // Fetch current plan
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

  const planTasks = await db.select().from(tasks);

  const fullPlan = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: planTasks.filter((t) => t.moduleId === mod.id),
    })),
  };

  const currentHash = calculatePlanHash(fullPlan);

  // Check existing sync state
  const [syncState] = await db
    .select()
    .from(notionSyncState)
    .where(eq(notionSyncState.planId, planId))
    .limit(1);

  if (!syncState) {
    // No previous sync, do full export
    await exportPlanToNotion(planId, accessToken);
    return true;
  }

  if (syncState.syncHash === currentHash) {
    // No changes detected
    return false;
  }

  // Changes detected, update Notion page
  const blocks = mapFullPlanToBlocks(fullPlan as any);
  const client = new NotionClient(accessToken);

  // Clear existing blocks and append new ones
  // (Notion doesn't have a replace operation, so we update the page)
  await client.updatePage({
    page_id: syncState.notionPageId,
    properties: {
      title: {
        title: [{ type: 'text', text: { content: plan.topic } }],
      },
    },
  });

  // Append updated blocks
  await client.appendBlocks(syncState.notionPageId, blocks);

  // Update sync state
  await db
    .update(notionSyncState)
    .set({
      syncHash: currentHash,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(notionSyncState.planId, planId));

  return true;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/notion-delta-sync.spec.ts
```

Expected: PASS

**Step 5: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 6: Commit**

```bash
git add src/lib/integrations/notion/sync.ts tests/integration/notion-delta-sync.spec.ts
git commit -m "feat(notion): add delta sync with hash-based change detection

Implement delta sync to detect plan changes via SHA-256 content hash.
Only syncs to Notion when changes detected, saving API calls.

Changes:
- Add calculatePlanHash utility
- Add deltaSyncPlanToNotion function
- Compare current hash with stored hash
- Update Notion page only if changes detected

New files:
- tests/integration/notion-delta-sync.spec.ts

Tests cover:
- Change detection via hash comparison
- Skip sync when no changes detected"
```

---
