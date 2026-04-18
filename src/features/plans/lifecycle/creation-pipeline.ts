import { calculateTotalWeeks } from '@/features/plans/api/shared';
import { logger } from '@/lib/logging/logger';

import type { PlanPersistencePort, QuotaPort } from './ports';
import type {
  CreatePlanResult,
  CreatePlanSuccess,
  NormalizedDuration,
  PlanInsertData,
  SubscriptionTier,
} from './types';

type CreationLifecycleLabel = 'create' | 'create_pdf';

export interface CreationGatePorts
  extends Pick<PlanPersistencePort, 'findCappedPlanWithoutModules'>,
    Pick<
      QuotaPort,
      'resolveUserTier' | 'checkDurationCap' | 'normalizePlanDuration'
    > {}

type CreationGateResult =
  | { blocked: true; result: CreatePlanResult }
  | {
      blocked: false;
      tier: SubscriptionTier;
      duration: NormalizedDuration;
    };

const CREATE_LOG_BASE: Record<CreationLifecycleLabel, string> = {
  create: 'plan.lifecycle.create',
  create_pdf: 'plan.lifecycle.create_pdf',
};

export function getCreateLogBase(
  lifecycleLabel: CreationLifecycleLabel
): string {
  return CREATE_LOG_BASE[lifecycleLabel];
}

export async function checkCreationGate(
  ports: CreationGatePorts,
  params: {
    userId: string;
    weeklyHours: number;
    startDate: string | null;
    deadlineDate: string | null;
    lifecycleLabel: CreationLifecycleLabel;
  }
): Promise<CreationGateResult> {
  const { userId, weeklyHours, startDate, deadlineDate, lifecycleLabel } =
    params;
  const logBase = getCreateLogBase(lifecycleLabel);

  const cappedPlanId = await ports.findCappedPlanWithoutModules(userId);
  if (cappedPlanId) {
    logger.info(
      { userId, cappedPlanId },
      `${logBase}: attempt cap exceeded (existing capped plan)`
    );
    return {
      blocked: true,
      result: {
        status: 'attempt_cap_exceeded',
        reason: `Existing plan ${cappedPlanId} has exhausted generation attempts. Please delete it or retry before creating a new plan.`,
        cappedPlanId,
      },
    };
  }

  const tier = await ports.resolveUserTier(userId);
  logger.info({ userId, tier }, `${logBase}: tier resolved`);

  const requestedWeeks = calculateTotalWeeks({
    startDate,
    deadlineDate,
  });
  const requestedCap = ports.checkDurationCap({
    tier,
    weeklyHours,
    totalWeeks: requestedWeeks,
  });
  if (!requestedCap.allowed) {
    logger.info(
      { userId, tier },
      `${logBase}: quota rejected (requested duration cap)`
    );
    return {
      blocked: true,
      result: {
        status: 'quota_rejected',
        reason: requestedCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: requestedCap.upgradeUrl,
      },
    };
  }

  const duration = ports.normalizePlanDuration({
    tier,
    weeklyHours,
    startDate,
    deadlineDate,
  });

  const durationCap = ports.checkDurationCap({
    tier,
    weeklyHours,
    totalWeeks: duration.totalWeeks,
  });

  if (!durationCap.allowed) {
    logger.info(
      { userId, tier },
      `${logBase}: quota rejected (normalized duration cap)`
    );
    return {
      blocked: true,
      result: {
        status: 'quota_rejected',
        reason: durationCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: durationCap.upgradeUrl,
      },
    };
  }

  return { blocked: false, tier, duration };
}

export async function insertCreatedPlan(params: {
  planPersistence: Pick<PlanPersistencePort, 'atomicInsertPlan'>;
  userId: string;
  tier: SubscriptionTier;
  lifecycleLabel: CreationLifecycleLabel;
  planData: PlanInsertData;
  normalizedInput: CreatePlanSuccess['normalizedInput'];
}): Promise<CreatePlanResult> {
  const {
    planPersistence,
    userId,
    tier,
    lifecycleLabel,
    planData,
    normalizedInput,
  } = params;

  const insertResult = await planPersistence.atomicInsertPlan(userId, planData);

  if (!insertResult.success) {
    logger.info(
      { userId },
      `${getCreateLogBase(lifecycleLabel)}: quota rejected (plan limit)`
    );
    return {
      status: 'quota_rejected',
      reason: insertResult.reason,
    };
  }

  logger.info(
    { userId, planId: insertResult.id, tier, origin: planData.origin },
    `${getCreateLogBase(lifecycleLabel)}: plan created`
  );
  return {
    status: 'success',
    planId: insertResult.id,
    tier,
    normalizedInput,
  };
}
