## Task 14: Tier Gates and Usage Tracking

**Files:**

- Modify: `src/lib/db/usage.ts`
- Modify: `src/app/api/v1/integrations/notion/export/route.ts`
- Modify: `src/app/api/v1/integrations/google-calendar/sync/route.ts`
- Create: `tests/integration/tier-gates.spec.ts`

**Step 1: Write failing test**

Create `tests/integration/tier-gates.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';

describe('Export Tier Gates', () => {
  let userId: string;

  beforeEach(async () => {
    await db.delete(users);
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'test_clerk',
        email: 'test@example.com',
        subscriptionTier: 'free',
      })
      .returning();
    userId = user.id;
  });

  it('should allow exports within free tier limit', async () => {
    const allowed = await checkExportQuota(userId, 'free');
    expect(allowed).toBe(true);
  });

  it('should block exports when free tier limit exceeded', async () => {
    // Simulate 2 exports (free limit)
    await incrementExportUsage(userId);
    await incrementExportUsage(userId);

    const allowed = await checkExportQuota(userId, 'free');
    expect(allowed).toBe(false);
  });

  it('should allow unlimited exports for pro tier', async () => {
    await db
      .update(users)
      .set({ subscriptionTier: 'pro' })
      .where(eq(users.id, userId));

    // Simulate 100 exports
    for (let i = 0; i < 100; i++) {
      await incrementExportUsage(userId);
    }

    const allowed = await checkExportQuota(userId, 'pro');
    expect(allowed).toBe(true);
  });
});
```

**Step 2: Implement usage tracking**

Edit `src/lib/db/usage.ts`, add:

```typescript
import { db } from './drizzle';
import { users } from './schema';
import { eq, sql } from 'drizzle-orm';

const TIER_LIMITS = {
  free: 2,
  starter: 10,
  pro: Infinity,
};

export async function checkExportQuota(
  userId: string,
  tier: 'free' | 'starter' | 'pro'
): Promise<boolean> {
  const limit = TIER_LIMITS[tier];

  if (limit === Infinity) {
    return true;
  }

  // Get current month's export count
  const [result] = await db
    .select({ exportCount: users.monthlyExportCount })
    .from(users)
    .where(eq(users.id, userId));

  return (result?.exportCount ?? 0) < limit;
}

export async function incrementExportUsage(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      monthlyExportCount: sql`${users.monthlyExportCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function resetMonthlyExportCounts(): Promise<void> {
  await db.update(users).set({ monthlyExportCount: 0 });
}
```

**Step 3: Add tier gates to export endpoints**

Edit `src/app/api/v1/integrations/notion/export/route.ts`:

```typescript
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';

// Add before exportPlanToNotion call:
const canExport = await checkExportQuota(user.id, user.subscriptionTier);
if (!canExport) {
  return NextResponse.json(
    {
      error: 'Export quota exceeded',
      message: 'Upgrade your plan to export more learning plans',
    },
    { status: 403 }
  );
}

// After successful export:
await incrementExportUsage(user.id);
```

Edit `src/app/api/v1/integrations/google-calendar/sync/route.ts` similarly.

**Step 4: Run test**

Run:

```bash
pnpm vitest run tests/integration/tier-gates.spec.ts
```

Expected: PASS

**Step 5: Update schema for export count**

Edit `src/lib/db/schema.ts`, add to users table:

```typescript
monthlyExportCount: integer('monthly_export_count').notNull().default(0),
```

**Step 6: Generate and apply migration**

Run:

```bash
pnpm db:generate && pnpm db:push && pnpm db:push:test
```

**Step 7: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 8: Commit**

```bash
git add src/lib/db/usage.ts src/lib/db/schema.ts src/app/api/v1/integrations/ tests/integration/tier-gates.spec.ts src/lib/db/migrations/
git commit -m "feat(integrations): add tier-based export quotas

Implement usage tracking and tier gates for Notion/Google Calendar
exports. Free tier limited to 2/month, starter 10/month, pro unlimited.

Changes:
- Add checkExportQuota and incrementExportUsage functions
- Add monthlyExportCount to users table
- Enforce quotas in export endpoints
- Return 403 with upgrade message when quota exceeded

New files:
- tests/integration/tier-gates.spec.ts

Tests cover:
- Free tier limit enforcement
- Pro tier unlimited exports
- Usage increment tracking"
```

---
