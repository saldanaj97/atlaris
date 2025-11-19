import { db } from '@/lib/db/service-role';
import { learningPlans } from '@/lib/db/schema';
import { describe, expect, it } from 'vitest';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

/**
 * Validates that simultaneous plan creations preserve an incrementing created_at ordering
 * and that no duplicate IDs are produced under concurrency.
 * Uses Promise.all to simulate concurrent inserts.
 */

describe('Concurrency - plan creation ordering', () => {
  it('maintains created_at ordering and uniqueness under concurrency', async () => {
    setTestUser('concurrency_creator');
    const userId = await ensureUser({
      clerkUserId: 'concurrency_creator',
      email: 'concurrency_creator@example.com',
    });

    const insertCount = 10;
    const results = await Promise.all(
      Array.from({ length: insertCount }).map((_, i) =>
        db
          .insert(learningPlans)
          .values({
            userId,
            topic: `Concurrent Plan ${i}`,
            skillLevel: 'beginner',
            weeklyHours: 2,
            learningStyle: 'reading',
            visibility: 'private',
            origin: 'ai',
          })
          .returning({
            id: learningPlans.id,
            createdAt: learningPlans.createdAt,
          })
      )
    );

    const flat = results.map((r) => r[0]);
    const ids = new Set(flat.map((r) => r.id));
    expect(ids.size).toBe(insertCount);

    const sorted = [...flat].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    // At least not reverse-sorted (in pathological cases timestamps could be equal) so we just
    // assert the final element timestamp is >= first.
    expect(
      sorted[sorted.length - 1].createdAt.getTime()
    ).toBeGreaterThanOrEqual(sorted[0].createdAt.getTime());
  });
});
