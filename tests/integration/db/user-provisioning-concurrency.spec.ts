import { getOrCreateUser } from '@/lib/db/queries/users';
import { users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('concurrent user provisioning', () => {
  it('resolves simultaneous first requests to the same user row', async () => {
    // The race window sits between the auth_user_id pre-check and the email
    // index insert, so several rounds of concurrent calls are needed to hit it.
    for (let round = 0; round < 10; round += 1) {
      const authUserId = buildTestAuthUserId(`user-provisioning-race-${round}`);
      const input = {
        authUserId,
        email: buildTestEmail(authUserId),
        name: 'Concurrent User',
      };

      const results = await Promise.all(
        Array.from({ length: 8 }, () => getOrCreateUser(input, db)),
      );

      const firstId = results[0]?.id;
      expect(firstId).toBeDefined();
      expect(results.map((user) => user?.id)).toEqual(
        results.map(() => firstId),
      );
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.authUserId, authUserId));
      expect(rows).toHaveLength(1);
    }
  });

  it('does not transfer an existing email to another auth identity', async () => {
    const firstAuthUserId = buildTestAuthUserId('user-email-owner');
    const secondAuthUserId = buildTestAuthUserId('user-email-conflict');
    const email = buildTestEmail(firstAuthUserId);

    const owner = await getOrCreateUser(
      { authUserId: firstAuthUserId, email, name: 'Email Owner' },
      db,
    );

    await expect(
      getOrCreateUser(
        { authUserId: secondAuthUserId, email, name: 'Conflicting User' },
        db,
      ),
    ).rejects.toMatchObject({
      cause: { code: '23505', constraint_name: 'users_email_unique' },
    });

    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(owner?.id);
    expect(rows[0]?.authUserId).toBe(firstAuthUserId);
  });
});
