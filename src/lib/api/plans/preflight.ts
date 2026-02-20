import { AttemptCapExceededError, ForbiddenError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import {
  atomicCheckAndInsertPlan,
  checkPlanDurationCap,
  resolveUserTier,
} from '@/lib/stripe/usage';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

import {
  preparePlanInputWithPdfOrigin,
  rollbackPdfUsageIfReserved,
  type PreparedPlanInput,
} from '@/lib/api/plans/pdf-origin';
import {
  requireInternalUserByAuthId,
  type PlansDbClient,
} from '@/lib/api/plans/route-context';
import type { DbUser } from '@/lib/db/queries/types/users.types';
import {
  calculateTotalWeeks,
  findCappedPlanWithoutModules,
  normalizePlanDurationForTier,
} from '@/lib/api/plans/shared';

export interface PlanCreationPreflightData {
  user: DbUser;
  userTier: SubscriptionTier;
  startDate: string | null;
  deadlineDate: string | null;
  totalWeeks: number;
  preparedInput: PreparedPlanInput;
}

type PreparePlanCreationPreflightParams = {
  body: CreateLearningPlanInput;
  authUserId: string;
  user?: DbUser;
  dbClient: PlansDbClient;
  enforceRequestedDurationCap?: boolean;
};

export async function preparePlanCreationPreflight(
  params: PreparePlanCreationPreflightParams
): Promise<PlanCreationPreflightData> {
  const {
    body,
    authUserId,
    user: existingUser,
    dbClient,
    enforceRequestedDurationCap = true,
  } = params;

  const user =
    existingUser ?? (await requireInternalUserByAuthId(authUserId, dbClient));
  const userTier = await resolveUserTier(user.id, dbClient);

  // First check: reject if the user's raw requested date range (before tier normalization) exceeds tier cap.
  // This gives a clear 403 when the request is obviously over limit.
  if (enforceRequestedDurationCap) {
    const requestedWeeks = calculateTotalWeeks({
      startDate: body.startDate ?? null,
      deadlineDate: body.deadlineDate ?? null,
    });
    const requestedCap = checkPlanDurationCap({
      tier: userTier,
      weeklyHours: body.weeklyHours,
      totalWeeks: requestedWeeks,
    });
    if (!requestedCap.allowed) {
      throw new ForbiddenError(
        requestedCap.reason ?? 'Plan duration exceeds tier cap'
      );
    }
  }

  const { startDate, deadlineDate, totalWeeks } = normalizePlanDurationForTier({
    tier: userTier,
    weeklyHours: body.weeklyHours,
    startDate: body.startDate ?? null,
    deadlineDate: body.deadlineDate ?? null,
  });

  // Second check: after normalizing (and possibly capping) duration to the tier, ensure the normalized plan still fits.
  const cap = checkPlanDurationCap({
    tier: userTier,
    weeklyHours: body.weeklyHours,
    totalWeeks,
  });
  if (!cap.allowed) {
    throw new ForbiddenError(cap.reason ?? 'Plan duration exceeds tier cap');
  }

  const cappedPlanId = await findCappedPlanWithoutModules(user.id, dbClient);
  if (cappedPlanId) {
    throw new AttemptCapExceededError('attempt cap reached', {
      planId: cappedPlanId,
    });
  }

  const preparedInput = await preparePlanInputWithPdfOrigin({
    body,
    authUserId,
    internalUserId: user.id,
    dbClient,
  });

  return {
    user,
    userTier,
    startDate,
    deadlineDate,
    totalWeeks,
    preparedInput,
  };
}

export async function insertPlanWithRollback(params: {
  preflight: PlanCreationPreflightData;
  dbClient: PlansDbClient;
}): Promise<{ id: string }> {
  const { preflight, dbClient } = params;
  const {
    user,
    startDate,
    deadlineDate,
    preparedInput: {
      origin,
      extractedContext,
      topic,
      skillLevel,
      weeklyHours,
      learningStyle,
      pdfUsageReserved,
    },
  } = preflight;

  try {
    return await atomicCheckAndInsertPlan(
      user.id,
      {
        topic,
        skillLevel,
        weeklyHours,
        learningStyle,
        visibility: 'private',
        origin,
        extractedContext,
        startDate,
        deadlineDate,
      },
      dbClient
    );
  } catch (error) {
    if (pdfUsageReserved) {
      try {
        await rollbackPdfUsageIfReserved({
          internalUserId: user.id,
          dbClient,
          reserved: pdfUsageReserved,
        });
      } catch (rollbackErr) {
        logger.error(
          { rollbackErr, userId: user.id },
          'Failed to rollback pdf plan usage'
        );
      }
    }

    throw error;
  }
}

export type PlanCreationDbClient = ReturnType<typeof getDb>;
