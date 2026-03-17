/**
 * QuotaAdapter — production implementation of QuotaPort.
 *
 * Thin wrapper around existing billing and plan utility functions.
 */

import {
  atomicCheckAndIncrementPdfUsage,
  decrementPdfPlanUsage,
  resolveUserTier,
} from '@/features/billing/usage';
import { checkPlanDurationCap } from '@/features/plans/lifecycle/plan-operations';
import { normalizePlanDurationForTier } from '@/features/plans/api/shared';
import type { DbClient } from '@/lib/db/types';

import type { QuotaPort } from '../ports';
import type {
  DurationCapResult,
  NormalizedDuration,
  PdfQuotaReservationResult,
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

  async reservePdfQuota(userId: string): Promise<PdfQuotaReservationResult> {
    return atomicCheckAndIncrementPdfUsage(userId, this.dbClient);
  }

  async rollbackPdfQuota(userId: string, reserved: boolean): Promise<void> {
    if (reserved) {
      await decrementPdfPlanUsage(userId, this.dbClient);
    }
  }
}