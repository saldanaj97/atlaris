/**
 * PlanPersistenceAdapter — production implementation of PlanPersistencePort.
 */

import type { PlanPersistencePort } from '../ports';
import type { AtomicInsertResult, PlanInsertData } from '../types';
import type { DbClient } from '@/lib/db/types';

import {
  atomicCheckAndInsertPlan,
  findCappedPlanWithoutModules,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from './plan-persistence-store';

export class PlanPersistenceAdapter implements PlanPersistencePort {
  constructor(private readonly dbClient: DbClient) {}

  async atomicInsertPlan(
    userId: string,
    planData: PlanInsertData,
  ): Promise<AtomicInsertResult> {
    return atomicCheckAndInsertPlan(userId, planData, this.dbClient);
  }

  async findCappedPlanWithoutModules(userId: string): Promise<string | null> {
    return findCappedPlanWithoutModules(userId, this.dbClient);
  }

  async markGenerationSuccess(planId: string): Promise<void> {
    await markPlanGenerationSuccess(planId, this.dbClient);
  }

  async markGenerationFailure(planId: string): Promise<void> {
    await markPlanGenerationFailure(planId, this.dbClient);
  }
}
