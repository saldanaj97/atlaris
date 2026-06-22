import { getOrCreateUser } from '@/lib/db/queries/users';
import { users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('concurrent user provisioning', () => {
  it('resolves simultaneous first requests to the same user row', async () => {
    const authUserId = buildTestAuthUserId('user-provisioning-race');
    const input = {
      authUserId,
      email: buildTestEmail(authUserId),
      name: 'Concurrent User',
    };

    const [first, second] = await Promise.all([
      getOrCreateUser(input, db),
      getOrCreateUser(input, db),
    ]);

    expect(first?.id).toBeDefined();
    expect(second?.id).toBe(first?.id);
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authUserId, authUserId));
    expect(rows).toHaveLength(1);
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
    ).rejects.toThrow();

    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(owner?.id);
    expect(rows[0]?.authUserId).toBe(firstAuthUserId);
  });
});
