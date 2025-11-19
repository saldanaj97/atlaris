import { describe, it, expect, beforeEach } from 'vitest';
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';
import { db } from '@/lib/db/service-role';
import { users } from '@/lib/db/schema';
import { eq, like } from 'drizzle-orm';

describe('Export Tier Gates', () => {
  let userId: string;

  beforeEach(async () => {
    // Clean up only test users to avoid cross-test interference
    await db.delete(users).where(like(users.email, 'test%'));
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

    for (let i = 0; i < 100; i++) {
      await incrementExportUsage(userId);
    }

    const allowed = await checkExportQuota(userId, 'pro');
    expect(allowed).toBe(true);
  });
});
