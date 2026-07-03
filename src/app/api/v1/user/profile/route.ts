import type { ActorUser } from '@/lib/db/queries/types/users.types';

import { updateUserProfileSchema } from '@/app/api/v1/user/profile/validation';
import { AppError, ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { upsertUserAnalyticsTimezone } from '@/lib/db/queries/user-preferences';
import { logger } from '@/lib/logging/logger';
import { users } from '@supabase/schema';
import { eq, sql } from 'drizzle-orm';

type UserProfileResponse = Pick<
  ActorUser,
  | 'id'
  | 'name'
  | 'email'
  | 'subscriptionTier'
  | 'subscriptionStatus'
  | 'createdAt'
  | 'analyticsTimezone'
>;

function toUserProfileResponse(user: ActorUser): UserProfileResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    subscriptionTier: user.subscriptionTier,
    subscriptionStatus: user.subscriptionStatus,
    createdAt: user.createdAt,
    analyticsTimezone: user.analyticsTimezone,
  };
}

// GET /api/v1/user/profile, PUT /api/v1/user/profile
export const GET = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ actor }) => {
    logger.info(
      { action: 'profile.read', userId: actor.authUserId },
      'Profile read',
    );
    return json(toUserProfileResponse(actor));
  },
);

export const PUT = requestBoundary.route(
  { rateLimit: 'mutation' },
  async ({ req, actor, db }) => {
    const body = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: () =>
        new ValidationError('Invalid JSON in request body'),
    });

    const parsed = updateUserProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid profile payload',
        parsed.error.flatten(),
      );
    }

    let responseUser = actor;

    if (parsed.data.name !== undefined) {
      // updatedAt must use the DB clock (sql`now()`), not `new Date()`, so it shares
      // the same clock as defaultNow() on insert. Otherwise Node-vs-Postgres clock
      // skew can let updatedAt land at or before createdAt under concurrent load
      // and break the strict-monotone assertion in tests/integration/api/user-profile.spec.ts.
      const updatedRows = await db
        .update(users)
        .set({
          name: parsed.data.name,
          updatedAt: sql<Date>`now()`,
        })
        .where(eq(users.authUserId, actor.authUserId))
        .returning();

      const updatedUser = updatedRows[0];
      if (!updatedUser) {
        logger.error(
          {
            action: 'profile.update',
            authUserId: actor.authUserId,
            internalUserId: actor.id,
          },
          'Profile update affected no rows; authenticated user missing from database',
        );
        throw new AppError(
          'Authenticated user record missing despite provisioning.',
          {
            status: 500,
            code: 'INTERNAL_ERROR',
          },
        );
      }

      responseUser = {
        ...updatedUser,
        analyticsTimezone: actor.analyticsTimezone,
        preferredAiModel: actor.preferredAiModel,
      };
    }

    if (parsed.data.analyticsTimezone !== undefined) {
      const updatedPreferences = await upsertUserAnalyticsTimezone(
        actor.id,
        parsed.data.analyticsTimezone,
        db,
      );

      if (!updatedPreferences) {
        throw new AppError('Failed to persist profile preferences.', {
          status: 500,
          code: 'PROFILE_PREFERENCES_UPDATE_FAILED',
          logMeta: { userId: actor.id },
        });
      }

      responseUser = {
        ...responseUser,
        analyticsTimezone: updatedPreferences.analyticsTimezone,
      };
    }

    logger.info(
      { action: 'profile.update', userId: actor.authUserId },
      'Profile updated',
    );
    return json(toUserProfileResponse(responseUser));
  },
);
