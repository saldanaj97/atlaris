import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import {
  applyClerkUserProjectionSource,
  clerkUserProjectionSourceFromBackendUser,
  clerkUserProjectionSourceFromWebhook,
  reconcileClerkUserIdentities,
} from '@/features/auth/clerk-user-projection';
import { describe, expect, it, vi } from 'vitest';

function userUpdatedEvent(
  emailAddresses: readonly {
    id: string;
    email_address: string;
    verification: { status: string };
  }[],
  primaryEmailAddressId: string | null,
  updatedAt = new Date('2026-08-11T10:00:00.000Z').getTime(),
): WebhookEvent {
  return {
    type: 'user.updated',
    data: {
      id: 'user_identity_fixture',
      updated_at: updatedAt,
      primary_email_address_id: primaryEmailAddressId,
      email_addresses: emailAddresses,
    },
  } as unknown as WebhookEvent;
}

function dryRunDb(
  localUsers: readonly {
    id: string;
    authUserId: string;
    email: string | null;
    clerkUserUpdatedAt: Date | null;
    clerkDeletedAt: Date | null;
  }[],
) {
  const limit = vi.fn().mockResolvedValue(localUsers);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where, orderBy });

  return {
    select: vi.fn().mockReturnValue({ from }),
    update: vi.fn(),
  };
}

function applyDb(localUser: {
  id: string;
  authUserId: string;
  email: string | null;
  clerkUserUpdatedAt: Date | null;
  clerkDeletedAt: Date | null;
}) {
  const selectLimit = vi.fn().mockResolvedValue([localUser]);
  const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const updateReturning = vi.fn().mockResolvedValue([{ id: localUser.id }]);
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });

  return {
    db: {
      select: vi.fn().mockReturnValue({ from: selectFrom }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    },
    updateSet,
    updateWhere,
  };
}

describe('clerkUserProjectionSourceFromWebhook', () => {
  it('uses only the exact verified primary email', () => {
    const source = clerkUserProjectionSourceFromWebhook(
      userUpdatedEvent(
        [
          {
            id: 'primary',
            email_address: 'primary@example.com',
            verification: { status: 'unverified' },
          },
          {
            id: 'secondary',
            email_address: 'secondary@example.com',
            verification: { status: 'verified' },
          },
        ],
        'primary',
      ),
    );

    expect(source).toEqual({
      kind: 'upsert',
      origin: 'webhook',
      type: 'user.updated',
      authUserId: 'user_identity_fixture',
      email: null,
      clerkUserUpdatedAt: new Date('2026-08-11T10:00:00.000Z'),
    });
  });

  it('returns a permanent tombstone source for a valid user deletion', () => {
    const receivedAt = new Date('2026-08-11T10:05:00.000Z');
    const source = clerkUserProjectionSourceFromWebhook(
      {
        type: 'user.deleted',
        data: { id: 'user_identity_fixture' },
      } as unknown as WebhookEvent,
      receivedAt,
    );

    expect(source).toEqual({
      kind: 'deleted',
      type: 'user.deleted',
      authUserId: 'user_identity_fixture',
      clerkDeletedAt: receivedAt,
    });
  });

  it('dry-runs updates and Clerk 404 tombstones without writing', async () => {
    const db = dryRunDb([
      {
        id: 'local_user',
        authUserId: 'user_current',
        email: null,
        clerkUserUpdatedAt: null,
        clerkDeletedAt: null,
      },
      {
        id: 'local_deleted_user',
        authUserId: 'user_missing_in_clerk',
        email: null,
        clerkUserUpdatedAt: null,
        clerkDeletedAt: null,
      },
    ]);
    const getUser = vi.fn(async (authUserId: string) => {
      if (authUserId === 'user_missing_in_clerk') {
        throw { status: 404 };
      }
      return {
        id: authUserId,
        updatedAt: new Date('2026-08-11T10:10:00.000Z').getTime(),
        primaryEmailAddressId: 'primary',
        emailAddresses: [
          {
            id: 'primary',
            emailAddress: 'current@example.com',
            verification: { status: 'verified' },
          },
        ],
      };
    });

    await expect(
      reconcileClerkUserIdentities({
        apply: false,
        clerkClient: { users: { getUser } },
        db: db as never,
        logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      }),
    ).resolves.toEqual({
      checked: 2,
      updated: 0,
      tombstoned: 0,
      wouldUpdate: 1,
      wouldTombstone: 1,
      skipped: 0,
      ignored: 0,
      failed: 0,
      nextCursor: null,
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('ignores an equal Clerk watermark when the projected email already matches', async () => {
    const clerkUserUpdatedAt = new Date('2026-08-11T10:10:00.000Z');
    const localUser = {
      id: 'local_user',
      authUserId: 'user_current',
      email: 'current@example.com',
      clerkUserUpdatedAt,
      clerkDeletedAt: null,
    };
    const db = dryRunDb([localUser]);
    const getUser = vi.fn().mockResolvedValue({
      id: localUser.authUserId,
      updatedAt: clerkUserUpdatedAt.getTime(),
      primaryEmailAddressId: 'primary',
      emailAddresses: [
        {
          id: 'primary',
          emailAddress: localUser.email,
          verification: { status: 'verified' },
        },
      ],
    });

    await expect(
      reconcileClerkUserIdentities({
        apply: false,
        clerkClient: { users: { getUser } },
        db: db as never,
        logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      }),
    ).resolves.toEqual({
      checked: 1,
      updated: 0,
      tombstoned: 0,
      wouldUpdate: 0,
      wouldTombstone: 0,
      skipped: 0,
      ignored: 1,
      failed: 0,
      nextCursor: null,
    });

    const limit = vi.fn().mockResolvedValue([localUser]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const applyDb = {
      select: vi.fn().mockReturnValue({ from }),
      update: vi.fn(),
    };
    await expect(
      applyClerkUserProjectionSource(
        {
          kind: 'upsert',
          origin: 'reconciliation',
          type: 'user.updated',
          authUserId: localUser.authUserId,
          email: localUser.email,
          clerkUserUpdatedAt,
        },
        {
          db: applyDb as never,
          logger: { info: vi.fn(), warn: vi.fn() },
        },
      ),
    ).resolves.toBe('ignored');
    expect(applyDb.update).not.toHaveBeenCalled();
  });
});

function webhookSource(email: string, updatedAt: Date) {
  const source = clerkUserProjectionSourceFromWebhook(
    userUpdatedEvent(
      [
        {
          id: 'primary',
          email_address: email,
          verification: { status: 'verified' },
        },
      ],
      'primary',
      updatedAt.getTime(),
    ),
  );
  if (source === null || source.kind !== 'upsert') {
    throw new Error('Expected a webhook upsert source');
  }
  return source;
}

describe('source-aware equal-watermark projection', () => {
  it('reports and repairs authoritative equal-watermark email drift', async () => {
    const clerkUserUpdatedAt = new Date('2026-08-11T10:10:00.000Z');
    const localUser = {
      id: 'local_user',
      authUserId: 'user_current',
      email: 'stale@example.com',
      clerkUserUpdatedAt,
      clerkDeletedAt: null,
    };
    const backendUser = {
      id: localUser.authUserId,
      updatedAt: clerkUserUpdatedAt.getTime(),
      primaryEmailAddressId: 'primary',
      emailAddresses: [
        {
          id: 'primary',
          emailAddress: 'current@example.com',
          verification: { status: 'verified' },
        },
      ],
    };
    const dryRun = dryRunDb([localUser]);

    await expect(
      reconcileClerkUserIdentities({
        apply: false,
        clerkClient: {
          users: { getUser: vi.fn().mockResolvedValue(backendUser) },
        },
        db: dryRun as never,
        logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      }),
    ).resolves.toMatchObject({
      checked: 1,
      wouldUpdate: 1,
      ignored: 0,
    });

    const applied = applyDb(localUser);
    await expect(
      applyClerkUserProjectionSource(
        clerkUserProjectionSourceFromBackendUser(backendUser),
        {
          db: applied.db as never,
          logger: { info: vi.fn(), warn: vi.fn() },
        },
      ),
    ).resolves.toBe('updated');
    expect(applied.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'current@example.com',
        clerkUserUpdatedAt,
      }),
    );
  });

  it('ignores an equal-watermark webhook email change', async () => {
    const clerkUserUpdatedAt = new Date('2026-08-11T10:10:00.000Z');
    const localUser = {
      id: 'local_user',
      authUserId: 'user_current',
      email: 'current@example.com',
      clerkUserUpdatedAt,
      clerkDeletedAt: null,
    };
    const applied = applyDb(localUser);

    await expect(
      applyClerkUserProjectionSource(
        webhookSource('drifted@example.com', clerkUserUpdatedAt),
        {
          db: applied.db as never,
          logger: { info: vi.fn(), warn: vi.fn() },
        },
      ),
    ).resolves.toBe('ignored');
    expect(applied.db.update).not.toHaveBeenCalled();
  });

  it.each([
    ['first@example.com', 'second@example.com'],
    ['second@example.com', 'first@example.com'],
  ])(
    'rejects equal-watermark webhook payloads in either arrival order',
    async (firstEmail, secondEmail) => {
      const clerkUserUpdatedAt = new Date('2026-08-11T10:10:00.000Z');
      const localUser = {
        id: 'local_user',
        authUserId: 'user_current',
        email: 'authoritative@example.com',
        clerkUserUpdatedAt,
        clerkDeletedAt: null,
      };
      const applied = applyDb(localUser);

      for (const email of [firstEmail, secondEmail]) {
        await expect(
          applyClerkUserProjectionSource(
            webhookSource(email, clerkUserUpdatedAt),
            {
              db: applied.db as never,
              logger: { info: vi.fn(), warn: vi.fn() },
            },
          ),
        ).resolves.toBe('ignored');
      }

      expect(applied.db.update).not.toHaveBeenCalled();
    },
  );

  it('allows a strictly newer webhook email update', async () => {
    const clerkUserUpdatedAt = new Date('2026-08-11T10:10:00.000Z');
    const newerUpdatedAt = new Date(clerkUserUpdatedAt.getTime() + 1);
    const localUser = {
      id: 'local_user',
      authUserId: 'user_current',
      email: 'current@example.com',
      clerkUserUpdatedAt,
      clerkDeletedAt: null,
    };
    const applied = applyDb(localUser);

    await expect(
      applyClerkUserProjectionSource(
        webhookSource('newer@example.com', newerUpdatedAt),
        {
          db: applied.db as never,
          logger: { info: vi.fn(), warn: vi.fn() },
        },
      ),
    ).resolves.toBe('updated');
    expect(applied.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newer@example.com',
        clerkUserUpdatedAt: newerUpdatedAt,
      }),
    );
  });
});
