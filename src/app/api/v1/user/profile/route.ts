import { eq } from 'drizzle-orm';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AppError, ValidationError } from '@/lib/api/errors';
import { requireInternalUserByAuthId } from '@/lib/api/plans/route-context';
import { json } from '@/lib/api/response';
import type { DbUser } from '@/lib/db/queries/types/users.types';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { updateUserProfileSchema } from '@/lib/validation/user-profile';

type UserProfileResponse = Pick<
  DbUser,
  | 'id'
  | 'name'
  | 'email'
  | 'subscriptionTier'
  | 'subscriptionStatus'
  | 'createdAt'
>;

function toUserProfileResponse(user: DbUser): UserProfileResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    subscriptionTier: user.subscriptionTier,
    subscriptionStatus: user.subscriptionStatus,
    createdAt: user.createdAt,
  };
}

// GET /api/v1/user/profile, PUT /api/v1/user/profile
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ userId }) => {
    const db = getDb();
    const user = await requireInternalUserByAuthId(userId, db);

    logger.info({ action: 'profile.read', userId }, 'Profile read');
    return json(toUserProfileResponse(user));
  })
);

export const PUT = withErrorBoundary(
  withAuthAndRateLimit('mutation', async ({ req, userId }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }

    const parsed = updateUserProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid profile payload',
        parsed.error.flatten()
      );
    }

    const db = getDb();
    const updatedRows = await db
      .update(users)
      .set({
        name: parsed.data.name,
        updatedAt: new Date(),
      })
      .where(eq(users.authUserId, userId))
      .returning();

    const updatedUser = updatedRows[0];
    if (!updatedUser) {
      throw new AppError(
        'Authenticated user record missing despite provisioning.',
        {
          status: 500,
          code: 'INTERNAL_ERROR',
        }
      );
    }

    logger.info({ action: 'profile.update', userId }, 'Profile updated');
    return json(toUserProfileResponse(updatedUser));
  })
);
