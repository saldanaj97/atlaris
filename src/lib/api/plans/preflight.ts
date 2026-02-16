import { AttemptCapExceededError } from '@/lib/api/errors';
import { jsonError } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import { atomicCheckAndInsertPlan, resolveUserTier } from '@/lib/stripe/usage';
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
import {
  calculateTotalWeeks,
  ensurePlanDurationAllowed,
  findCappedPlanWithoutModules,
  normalizePlanDurationForTier,
} from '@/lib/api/plans/shared';

export interface PlanCreationPreflightData {
  user: Awaited<ReturnType<typeof requireInternalUserByAuthId>>;
  userTier: SubscriptionTier;
  startDate: string | null;
  deadlineDate: string | null;
  totalWeeks: number;
  preparedInput: PreparedPlanInput;
}

export type PlanCreationPreflightResult =
  | {
      ok: true;
      data: PlanCreationPreflightData;
    }
  | {
      ok: false;
      response: Response;
    };

type PreparePlanCreationPreflightParams = {
  body: CreateLearningPlanInput;
  authUserId: string;
  resolvedUser?: Awaited<ReturnType<typeof requireInternalUserByAuthId>>;
  dbClient: PlansDbClient;
  enforceRequestedDurationCap?: boolean;
};

export async function preparePlanCreationPreflight(
  params: PreparePlanCreationPreflightParams
): Promise<PlanCreationPreflightResult> {
  const {
    body,
    authUserId,
    resolvedUser,
    dbClient,
    enforceRequestedDurationCap = true,
  } = params;

  const user = resolvedUser ?? (await requireInternalUserByAuthId(authUserId));
  const userTier = await resolveUserTier(user.id, dbClient);

  // First check: reject if the user's raw requested date range (before tier normalization) exceeds tier cap.
  // This gives a clear 403 when the request is obviously over limit.
  if (enforceRequestedDurationCap) {
    const requestedWeeks = calculateTotalWeeks({
      startDate: body.startDate ?? null,
      deadlineDate: body.deadlineDate ?? null,
    });
    const requestedCap = ensurePlanDurationAllowed({
      userTier,
      weeklyHours: body.weeklyHours,
      totalWeeks: requestedWeeks,
    });
    if (!requestedCap.allowed) {
      return {
        ok: false,
        response: jsonError(
          requestedCap.reason ?? 'Plan duration exceeds tier cap',
          {
            status: 403,
          }
        ),
      };
    }
  }

  const { startDate, deadlineDate, totalWeeks } = normalizePlanDurationForTier({
    tier: userTier,
    weeklyHours: body.weeklyHours,
    startDate: body.startDate ?? null,
    deadlineDate: body.deadlineDate ?? null,
  });

  // Second check: after normalizing (and possibly capping) duration to the tier, ensure the normalized plan still fits.
  const cap = ensurePlanDurationAllowed({
    userTier,
    weeklyHours: body.weeklyHours,
    totalWeeks,
  });
  if (!cap.allowed) {
    return {
      ok: false,
      response: jsonError(cap.reason ?? 'Plan duration exceeds tier cap', {
        status: 403,
      }),
    };
  }

  // AttemptCapExceededError is thrown (not returned as ok: false) so the stream handler
  // can map it to a specific status/error boundary; callers must handle both return and throw.
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

  if (!preparedInput.ok) {
    return preparedInput;
  }

  return {
    ok: true,
    data: {
      user,
      userTier,
      startDate,
      deadlineDate,
      totalWeeks,
      preparedInput: preparedInput.data,
    },
  };
}

export async function insertPlanWithRollback(params: {
  body: CreateLearningPlanInput;
  preflight: PlanCreationPreflightData;
  dbClient: PlansDbClient;
}): Promise<{ id: string }> {
  const { body, preflight, dbClient } = params;
  const {
    user,
    startDate,
    deadlineDate,
    preparedInput: { origin, extractedContext, topic, pdfUsageReserved },
  } = preflight;

  try {
    return await atomicCheckAndInsertPlan(
      user.id,
      {
        topic,
        skillLevel: body.skillLevel,
        weeklyHours: body.weeklyHours,
        learningStyle: body.learningStyle,
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
        logger.warn(
          {
            error: rollbackErr,
            internalUserId: user.id,
            reserved: pdfUsageReserved,
          },
          'rollbackPdfUsageIfReserved failed; original error preserved'
        );
      }
    }

    throw error;
  }
}
