/**
 * QuotaAdapter — production implementation of QuotaPort.
 *
 * Thin wrapper around existing billing and plan utility functions.
 */

import { resolveUserTier } from '@/features/billing/tier';
import {
  checkPlanDurationCap,
  normalizePlanDurationForTier,
} from '@/features/plans/policy/duration';
import type { DbClient } from '@/lib/db/types';

import type { QuotaPort } from '../ports';
import type {
  DurationCapResult,
  NormalizedDuration,
  SubscriptionTier,
} from '../types';

export class QuotaAdapter implements QuotaPort {
  constructor(private readonly dbClient: DbClient) {}

  async resolveUserTier(userId: string): Promise<SubscriptionTier> {
    return resolveUserTier(userId, this.dbClient);
  }

  checkDurationCap(params: {
    tier: SubscriptionTier;
    weeklyHours: number;
    totalWeeks: number;
  }): DurationCapResult {
    return checkPlanDurationCap(params);
  }

  normalizePlanDuration(params: {
    tier: SubscriptionTier;
    weeklyHours: number;
    startDate?: string | null;
    deadlineDate?: string | null;
    today?: Date;
  }): NormalizedDuration {
    return normalizePlanDurationForTier(params);
  }
}
