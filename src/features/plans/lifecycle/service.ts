/**
 * PlanLifecycleService — orchestrates plan creation through port interfaces.
 *
 * This service has ZERO direct imports from billing, AI, DB, or job modules.
 * All interaction with external concerns goes through injected ports.
 *
 * Returns discriminated union results for expected lifecycle outcomes.
 * Only unexpected errors (bugs) propagate as thrown exceptions.
 */

import type {
  GenerationPort,
  JobQueuePort,
  PdfOriginPort,
  PlanPersistencePort,
  QuotaPort,
  UsageRecordingPort,
} from './ports';
import type { CreateAiPlanInput, CreatePlanResult } from './types';

export interface PlanLifecycleServicePorts {
  readonly planPersistence: PlanPersistencePort;
  readonly quota: QuotaPort;
  readonly pdfOrigin: PdfOriginPort;
  readonly generation: GenerationPort;
  readonly usageRecording: UsageRecordingPort;
  readonly jobQueue: JobQueuePort;
}

export class PlanLifecycleService {
  private readonly ports: PlanLifecycleServicePorts;

  constructor(ports: PlanLifecycleServicePorts) {
    this.ports = ports;
  }

  /**
   * Create a new AI-origin learning plan.
   *
   * Flow: validate → resolve tier → normalize duration → check duration cap
   *       → check attempt cap → prepare input → atomic insert
   *
   * @returns A discriminated union result — never throws for lifecycle outcomes.
   */
  async createPlan(input: CreateAiPlanInput): Promise<CreatePlanResult> {
    // 1. Validate input
    if (!input.topic || input.topic.trim().length < 3) {
      return {
        status: 'permanent_failure',
        classification: 'validation',
        error: new Error(
          'Topic is required and must be at least 3 characters for AI-origin plans.'
        ),
      };
    }

    // 2. Resolve tier
    const tier = await this.ports.quota.resolveUserTier(input.userId);

    // 3. Normalize plan duration for the tier
    const duration = this.ports.quota.normalizePlanDuration({
      tier,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    // 4. Check duration cap
    const durationCap = this.ports.quota.checkDurationCap({
      tier,
      weeklyHours: input.weeklyHours,
      totalWeeks: duration.totalWeeks,
    });

    if (!durationCap.allowed) {
      return {
        status: 'quota_rejected',
        reason: durationCap.reason ?? 'Plan duration exceeds tier limits',
        upgradeUrl: durationCap.upgradeUrl,
      };
    }

    // 5. Check for capped plan (exhausted generation attempts)
    const cappedPlanId =
      await this.ports.planPersistence.findCappedPlanWithoutModules(
        input.userId
      );
    if (cappedPlanId) {
      return {
        status: 'quota_rejected',
        reason: `Existing plan ${cappedPlanId} has exhausted generation attempts. Please delete it or retry before creating a new plan.`,
      };
    }

    // 6. Atomic insert (checks plan limit + inserts within a single transaction)
    const insertResult = await this.ports.planPersistence.atomicInsertPlan(
      input.userId,
      {
        topic: input.topic.trim(),
        skillLevel: input.skillLevel,
        weeklyHours: input.weeklyHours,
        learningStyle: input.learningStyle,
        visibility: 'private',
        origin: 'ai',
        startDate: duration.startDate,
        deadlineDate: duration.deadlineDate,
      }
    );

    if (!insertResult.success) {
      return {
        status: 'quota_rejected',
        reason: insertResult.reason,
      };
    }

    return {
      status: 'success',
      planId: insertResult.id,
      tier,
    };
  }
}
