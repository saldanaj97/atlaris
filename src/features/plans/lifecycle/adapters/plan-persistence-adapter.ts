/**
 * PlanPersistenceAdapter — production implementation of PlanPersistencePort.
 */

import { PlanLimitReachedError } from '@/features/plans/errors';
import type { DbClient } from '@/lib/db/types';

import type { PlanPersistencePort } from '../ports';
import type { AtomicInsertResult, PlanInsertData } from '../types';
import {
  atomicCheckAndInsertPlan,
  findCappedPlanWithoutModules,
  findRecentDuplicatePlan,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from './plan-persistence-store';

export class PlanPersistenceAdapter implements PlanPersistencePort {
  constructor(private readonly dbClient: DbClient) {}

  async atomicInsertPlan(
    userId: string,
    planData: PlanInsertData
  ): Promise<AtomicInsertResult> {
    try {
      const result = await atomicCheckAndInsertPlan(
        userId,
        planData,
        this.dbClient
      );
      return { success: true, id: result.id };
    } catch (error) {
      if (error instanceof PlanLimitReachedError) {
        return {
          success: false,
          reason: 'Plan limit reached for current subscription tier',
        };
      }
      throw error;
    }
  }

  async findCappedPlanWithoutModules(userId: string): Promise<string | null> {
    return findCappedPlanWithoutModules(userId, this.dbClient);
  }

  async findRecentDuplicatePlan(
    userId: string,
    normalizedTopic: string
  ): Promise<string | null> {
    return findRecentDuplicatePlan(userId, normalizedTopic, this.dbClient);
  }

  async markGenerationSuccess(planId: string): Promise<void> {
    await markPlanGenerationSuccess(planId, this.dbClient);
  }

  async markGenerationFailure(planId: string): Promise<void> {
    await markPlanGenerationFailure(planId, this.dbClient);
  }
}
