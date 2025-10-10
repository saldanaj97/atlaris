import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { aiUsageEvents, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ensureWithinBudget, recordUsage } from '@/lib/db/usage';

async function ensureUser(): Promise<string> {
  const clerkUserId = process.env.DEV_CLERK_USER_ID || `test-${Date.now()}`;
  const email = `${clerkUserId}@example.com`;
  const [user] = await db
    .insert(users)
    .values({ clerkUserId, email, name: 'Test' })
    .onConflictDoNothing()
    .returning();
  if (user?.id) return user.id;
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return existing!.id;
}

describe('AI usage logging', () => {
  it('ensures budget and records usage event', async () => {
    const userId = await ensureUser();
    await ensureWithinBudget(userId, { type: 'plan' });
    await recordUsage({
      userId,
      provider: 'mock',
      model: 'mock-generator-v1',
      inputTokens: 10,
      outputTokens: 100,
      costCents: 0,
      kind: 'plan',
    });

    const rows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.provider).toBe('mock');
  });
});
