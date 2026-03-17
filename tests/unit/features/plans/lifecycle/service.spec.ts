import { describe, it, expect, beforeEach } from 'vitest';

import { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { PlanLifecycleServicePorts } from '@/features/plans/lifecycle/service';
import type { CreateAiPlanInput } from '@/features/plans/lifecycle/types';

// ─── Helpers ─────────────────────────────────────────────────────

function createMockPorts(
  overrides?: Partial<PlanLifecycleServicePorts>
): PlanLifecycleServicePorts {
  return {
    planPersistence: {
      atomicInsertPlan: async () => ({
        success: true as const,
        id: 'plan-123',
      }),
      findCappedPlanWithoutModules: async () => null,
      markGenerationSuccess: async () => {},
      markGenerationFailure: async () => {},
    },
    quota: {
      resolveUserTier: async () => 'free' as const,
      checkDurationCap: () => ({ allowed: true }),
      normalizePlanDuration: () => ({
        startDate: '2025-01-01',
        deadlineDate: '2025-01-15',
        totalWeeks: 2,
      }),
      reservePdfQuota: async () => ({
        allowed: true as const,
        newCount: 1,
        limit: 3,
      }),
      rollbackPdfQuota: async () => {},
    },
    pdfOrigin: {
      preparePlanInput: async () => ({
        origin: 'pdf' as const,
        extractedContext: null,
        topic: 'test',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        pdfUsageReserved: false,
        pdfProvenance: null,
      }),
      rollbackPdfUsage: async () => {},
    },
    generation: {
      runGeneration: async () => ({
        status: 'success' as const,
        modules: [],
        metadata: {},
        durationMs: 1000,
      }),
    },
    usageRecording: {
      recordUsage: async () => {},
    },
    jobQueue: {
      enqueueJob: async () => 'job-123',
      completeJob: async () => {},
      failJob: async () => {},
    },
    ...overrides,
  };
}

const validInput: CreateAiPlanInput = {
  userId: 'user-abc',
  topic: 'Learn TypeScript',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
};

// ─── Tests ───────────────────────────────────────────────────────

describe('PlanLifecycleService', () => {
  let service: PlanLifecycleService;
  let ports: PlanLifecycleServicePorts;

  beforeEach(() => {
    ports = createMockPorts();
    service = new PlanLifecycleService(ports);
  });

  describe('createPlan', () => {
    it('succeeds for valid AI-origin input and returns plan ID', async () => {
      const result = await service.createPlan(validInput);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.planId).toBe('plan-123');
        expect(result.tier).toBe('free');
      }
    });

    it('rejects when plan cap is reached', async () => {
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          atomicInsertPlan: async () => ({
            success: false as const,
            reason: 'Plan limit reached for current subscription tier',
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPlan(validInput);

      expect(result.status).toBe('quota_rejected');
      if (result.status === 'quota_rejected') {
        expect(result.reason).toContain('Plan limit reached');
      }
    });

    it('rejects when duration cap is exceeded', async () => {
      ports = createMockPorts({
        quota: {
          ...createMockPorts().quota,
          checkDurationCap: () => ({
            allowed: false,
            reason: 'Free tier limited to 4 weeks',
            upgradeUrl: '/upgrade',
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPlan(validInput);

      expect(result.status).toBe('quota_rejected');
      if (result.status === 'quota_rejected') {
        expect(result.reason).toContain('4 weeks');
        expect(result.upgradeUrl).toBe('/upgrade');
      }
    });

    it('returns permanent_failure when topic is too short', async () => {
      const result = await service.createPlan({ ...validInput, topic: 'ab' });

      expect(result.status).toBe('permanent_failure');
      if (result.status === 'permanent_failure') {
        expect(result.classification).toBe('validation');
        expect(result.error.message).toContain('at least 3 characters');
      }
    });

    it('returns permanent_failure when topic is empty', async () => {
      const result = await service.createPlan({ ...validInput, topic: '' });

      expect(result.status).toBe('permanent_failure');
      if (result.status === 'permanent_failure') {
        expect(result.classification).toBe('validation');
      }
    });

    it('rejects when a capped plan exists', async () => {
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          findCappedPlanWithoutModules: async () => 'capped-plan-456',
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPlan(validInput);

      expect(result.status).toBe('quota_rejected');
      if (result.status === 'quota_rejected') {
        expect(result.reason).toContain('capped-plan-456');
        expect(result.reason).toContain('exhausted generation attempts');
      }
    });

    it('passes normalized dates to atomicInsertPlan', async () => {
      let capturedData: unknown;
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          atomicInsertPlan: async (_userId, planData) => {
            capturedData = planData;
            return { success: true as const, id: 'plan-789' };
          },
        },
        quota: {
          ...createMockPorts().quota,
          normalizePlanDuration: () => ({
            startDate: '2025-03-01',
            deadlineDate: '2025-03-15',
            totalWeeks: 2,
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      await service.createPlan(validInput);

      expect(capturedData).toMatchObject({
        topic: 'Learn TypeScript',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        startDate: '2025-03-01',
        deadlineDate: '2025-03-15',
      });
    });

    it('trims whitespace from topic before inserting', async () => {
      let capturedData: unknown;
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          atomicInsertPlan: async (_userId, planData) => {
            capturedData = planData;
            return { success: true as const, id: 'plan-trim' };
          },
        },
      });
      service = new PlanLifecycleService(ports);

      await service.createPlan({ ...validInput, topic: '  Learn Rust  ' });

      expect(capturedData).toMatchObject({ topic: 'Learn Rust' });
    });

    it('resolves tier for the correct userId', async () => {
      let capturedUserId: string | undefined;
      ports = createMockPorts({
        quota: {
          ...createMockPorts().quota,
          resolveUserTier: async (userId) => {
            capturedUserId = userId;
            return 'pro';
          },
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPlan({
        ...validInput,
        userId: 'user-xyz',
      });

      expect(capturedUserId).toBe('user-xyz');
      if (result.status === 'success') {
        expect(result.tier).toBe('pro');
      }
    });
  });
});
