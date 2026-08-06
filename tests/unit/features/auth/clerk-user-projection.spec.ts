import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import {
  applyClerkUserProjectionSource,
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
): WebhookEvent {
  return {
    type: 'user.updated',
    data: {
      id: 'user_identity_fixture',
      updated_at: new Date('2026-08-11T10:00:00.000Z').getTime(),
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
