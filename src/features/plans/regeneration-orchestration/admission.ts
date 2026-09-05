import type { RegenerationOwnedPlan } from './types';
import type { PlanRegenerationOverridesInput } from '@/features/plans/validation/learningPlans.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { toPlanCalendarDate } from '@/features/plans/calendar-date';
import {
  calculateTotalWeeks,
  checkPlanDurationCap,
} from '@/features/plans/policy/duration';

export type RegenerationPolicyDenial =
  | { readonly kind: 'not-included' }
  | {
      readonly kind: 'duration-exceeded';
      readonly reason: string;
      readonly upgradeUrl?: string;
    };

function resolveDateOverride(
  field: 'Start' | 'Deadline',
  override: string | null | undefined,
  fallback: string | null,
): string | undefined {
  const value = override === undefined ? fallback : override;
  if (value === null || value === undefined) {
    return undefined;
  }

  if (toPlanCalendarDate(value) !== value) {
    throw new Error(`${field} date must be a valid YYYY-MM-DD calendar date.`);
  }

  return value;
}

function hasValidPlanCalendarDate(value: string | null | undefined): boolean {
  return (
    value === null || value === undefined || toPlanCalendarDate(value) === value
  );
}

/**
 * Effective regen input: topic comes from the persisted plan; notes are intentionally undefined because plans do not persist them.
 * Allowed overrides: skillLevel, weeklyHours, learningStyle, startDate, deadlineDate.
 */
export function buildPersistedRegenerationInput(
  plan: Pick<
    RegenerationOwnedPlan,
    | 'topic'
    | 'skillLevel'
    | 'weeklyHours'
    | 'learningStyle'
    | 'startDate'
    | 'deadlineDate'
  >,
  overrides?: Pick<
    PlanRegenerationOverridesInput,
    | 'skillLevel'
    | 'weeklyHours'
    | 'learningStyle'
    | 'startDate'
    | 'deadlineDate'
  >,
): GenerationInput {
  return {
    topic: plan.topic,
    notes: undefined,
    skillLevel: overrides?.skillLevel ?? plan.skillLevel,
    weeklyHours: overrides?.weeklyHours ?? plan.weeklyHours,
    learningStyle: overrides?.learningStyle ?? plan.learningStyle,
    startDate: resolveDateOverride(
      'Start',
      overrides?.startDate,
      plan.startDate,
    ),
    deadlineDate: resolveDateOverride(
      'Deadline',
      overrides?.deadlineDate,
      plan.deadlineDate,
    ),
  };
}

/**
 * Free deny takes precedence over duration. Does not clamp dates.
 */
export function resolveRegenerationPolicyDenial(params: {
  readonly tier: SubscriptionTier;
  readonly startDate?: string | null;
  readonly deadlineDate?: string | null;
}): RegenerationPolicyDenial | null {
  if (params.tier === 'free') {
    return { kind: 'not-included' };
  }

  if (
    !hasValidPlanCalendarDate(params.startDate) ||
    !hasValidPlanCalendarDate(params.deadlineDate)
  ) {
    return {
      kind: 'duration-exceeded',
      reason: 'Plan dates must be valid YYYY-MM-DD calendar dates.',
    };
  }

  if (
    params.startDate !== null &&
    params.startDate !== undefined &&
    params.deadlineDate !== null &&
    params.deadlineDate !== undefined &&
    params.startDate > params.deadlineDate
  ) {
    return {
      kind: 'duration-exceeded',
      reason: 'Start date must be on or before the deadline date.',
    };
  }

  const totalWeeks = calculateTotalWeeks({
    startDate: params.startDate,
    deadlineDate: params.deadlineDate,
  });
  const cap = checkPlanDurationCap({
    tier: params.tier,
    totalWeeks,
  });
  if (!cap.allowed) {
    return {
      kind: 'duration-exceeded',
      reason: cap.reason ?? 'Plan duration exceeds tier limits',
      ...(cap.upgradeUrl !== undefined ? { upgradeUrl: cap.upgradeUrl } : {}),
    };
  }

  return null;
}

export function rawRegenerationOverridesHaveImmutableFields(
  data: unknown,
): boolean {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  if (!('overrides' in data)) {
    return false;
  }
  const overrides = data.overrides;
  if (typeof overrides !== 'object' || overrides === null) {
    return false;
  }
  return 'topic' in overrides || 'notes' in overrides;
}
