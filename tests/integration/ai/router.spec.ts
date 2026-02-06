import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/service-role';
import { learningPlans, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

describe('AI Router (mock in tests)', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'router';
    process.env.AI_USE_MOCK = 'true';
  });

  it('returns modules using mock provider via router', async () => {
    // Ensure a user + plan exist and are linked
    const authUserId = process.env.DEV_AUTH_USER_ID || `test-${Date.now()}`;
    const email = `${authUserId}@example.com`;
    const [userRow] = await db
      .insert(users)
      .values({ authUserId, email, name: 'Test' })
      .onConflictDoNothing()
      .returning();
    const userId =
      userRow?.id ??
      (
        await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.authUserId, authUserId))
          .limit(1)
      )[0].id;

    const [planRow] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'TypeScript',
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    const result = await runGenerationAttempt({
      planId: planRow.id,
      userId,
      input: {
        topic: 'TypeScript',
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'mixed',
        notes: null,
      },
    });

    // In test setup, DB is truncated and direct insertion is allowed, but here we only assert result shape
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.modules.length).toBeGreaterThan(0);
    }
  });
});
