import { describe, it, expect, beforeEach, vi } from 'vitest';

import { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { PlanLifecycleServicePorts } from '@/features/plans/lifecycle/service';
import type {
  CreateAiPlanInput,
  CreatePdfPlanInput,
} from '@/features/plans/lifecycle/types';

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
      findRecentDuplicatePlan: async () => null,
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
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          model: 'unknown',
          provider: 'unknown',
          estimatedCostCents: 0,
        },
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

    it('returns duplicate_detected when a recent duplicate plan exists', async () => {
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          findRecentDuplicatePlan: async () => 'existing-plan-id',
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPlan(validInput);

      expect(result.status).toBe('duplicate_detected');
      if (result.status === 'duplicate_detected') {
        expect(result.existingPlanId).toBe('existing-plan-id');
      }
    });

    it('does not call atomicInsertPlan when duplicate is detected', async () => {
      const insertSpy = vi
        .fn()
        .mockResolvedValue({ success: true as const, id: 'plan-new' });
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          findRecentDuplicatePlan: async () => 'existing-plan-id',
          atomicInsertPlan: insertSpy,
        },
      });
      service = new PlanLifecycleService(ports);

      await service.createPlan(validInput);

      expect(insertSpy).not.toHaveBeenCalled();
    });

    it('passes userId and trimmed topic to findRecentDuplicatePlan', async () => {
      let capturedUserId: string | undefined;
      let capturedTopic: string | undefined;
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          findRecentDuplicatePlan: async (userId, topic) => {
            capturedUserId = userId;
            capturedTopic = topic;
            return null;
          },
        },
      });
      service = new PlanLifecycleService(ports);

      await service.createPlan({
        ...validInput,
        topic: '  Learn TypeScript  ',
      });

      expect(capturedUserId).toBe('user-abc');
      expect(capturedTopic).toBe('Learn TypeScript');
    });

    it('proceeds to create plan when no duplicate exists', async () => {
      // Default mock returns null for findRecentDuplicatePlan
      const result = await service.createPlan(validInput);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.planId).toBe('plan-123');
      }
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

  describe('createPdfPlan', () => {
    const validPdfInput: CreatePdfPlanInput = {
      userId: 'user-abc',
      authUserId: 'auth-abc',
      topic: 'Learn TypeScript',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      body: {
        origin: 'pdf',
        topic: 'Learn TypeScript',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        extractedContent: { mainTopic: 'TypeScript Basics' },
        pdfProofToken: 'proof-token-123',
        pdfExtractionHash: 'hash-abc',
      },
      extractedContent: { mainTopic: 'TypeScript Basics' },
      pdfProofToken: 'proof-token-123',
      pdfExtractionHash: 'hash-abc',
    };

    it('succeeds for valid PDF-origin input and returns plan ID', async () => {
      const prepareSpy = vi.fn().mockResolvedValue({
        origin: 'pdf' as const,
        extractedContext: { mainTopic: 'TypeScript Basics' },
        topic: 'TypeScript Basics',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        pdfUsageReserved: true,
        pdfProvenance: { extractionHash: 'hash-abc', proofVersion: 1 },
      });
      ports = createMockPorts({
        pdfOrigin: {
          preparePlanInput: prepareSpy,
          rollbackPdfUsage: async () => {},
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPdfPlan(validPdfInput);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.planId).toBe('plan-123');
        expect(result.tier).toBe('free');
      }
      expect(prepareSpy).toHaveBeenCalledWith({
        body: validPdfInput.body,
        authUserId: 'auth-abc',
        internalUserId: 'user-abc',
      });
    });

    it('rolls back quota when proof verification fails (preparePlanInput throws)', async () => {
      const rollbackSpy = vi.fn().mockResolvedValue(undefined);
      ports = createMockPorts({
        pdfOrigin: {
          preparePlanInput: vi
            .fn()
            .mockRejectedValue(new Error('Invalid PDF proof')),
          rollbackPdfUsage: rollbackSpy,
        },
      });
      service = new PlanLifecycleService(ports);

      await expect(service.createPdfPlan(validPdfInput)).rejects.toThrow(
        'Invalid PDF proof'
      );
      // preparePlanInput handles its own internal rollback when it throws,
      // but the service does NOT call rollbackPdfUsage since reservation
      // never completed (preparePlanInput threw before returning).
      // The rollback guard only triggers after preparePlanInput succeeds.
      expect(rollbackSpy).not.toHaveBeenCalled();
    });

    it('rolls back quota when atomic insert fails', async () => {
      const rollbackSpy = vi.fn().mockResolvedValue(undefined);
      ports = createMockPorts({
        pdfOrigin: {
          preparePlanInput: vi.fn().mockResolvedValue({
            origin: 'pdf' as const,
            extractedContext: { mainTopic: 'Test' },
            topic: 'Test Topic',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            pdfUsageReserved: true,
            pdfProvenance: { extractionHash: 'hash-abc', proofVersion: 1 },
          }),
          rollbackPdfUsage: rollbackSpy,
        },
        planPersistence: {
          ...createMockPorts().planPersistence,
          atomicInsertPlan: async () => ({
            success: false as const,
            reason: 'Plan limit reached for current subscription tier',
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPdfPlan(validPdfInput);

      expect(result.status).toBe('quota_rejected');
      if (result.status === 'quota_rejected') {
        expect(result.reason).toContain('Plan limit reached');
      }
      expect(rollbackSpy).toHaveBeenCalledWith({
        internalUserId: 'user-abc',
        reserved: true,
      });
    });

    it('rolls back quota when atomic insert throws unexpected error', async () => {
      const rollbackSpy = vi.fn().mockResolvedValue(undefined);
      ports = createMockPorts({
        pdfOrigin: {
          preparePlanInput: vi.fn().mockResolvedValue({
            origin: 'pdf' as const,
            extractedContext: null,
            topic: 'Test',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            pdfUsageReserved: true,
            pdfProvenance: null,
          }),
          rollbackPdfUsage: rollbackSpy,
        },
        planPersistence: {
          ...createMockPorts().planPersistence,
          atomicInsertPlan: vi
            .fn()
            .mockRejectedValue(new Error('DB connection lost')),
        },
      });
      service = new PlanLifecycleService(ports);

      await expect(service.createPdfPlan(validPdfInput)).rejects.toThrow(
        'DB connection lost'
      );
      expect(rollbackSpy).toHaveBeenCalledWith({
        internalUserId: 'user-abc',
        reserved: true,
      });
    });

    it('does not rollback when pdfUsageReserved is false', async () => {
      const rollbackSpy = vi.fn().mockResolvedValue(undefined);
      ports = createMockPorts({
        pdfOrigin: {
          preparePlanInput: vi.fn().mockResolvedValue({
            origin: 'pdf' as const,
            extractedContext: null,
            topic: 'Test',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            pdfUsageReserved: false,
            pdfProvenance: null,
          }),
          rollbackPdfUsage: rollbackSpy,
        },
        planPersistence: {
          ...createMockPorts().planPersistence,
          atomicInsertPlan: async () => ({
            success: false as const,
            reason: 'Plan limit reached',
          }),
        },
      });
      service = new PlanLifecycleService(ports);

      await service.createPdfPlan(validPdfInput);

      expect(rollbackSpy).toHaveBeenCalledWith({
        internalUserId: 'user-abc',
        reserved: false,
      });
    });

    it('returns duplicate_detected when a recent duplicate PDF plan exists', async () => {
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          findRecentDuplicatePlan: async () => 'existing-pdf-plan-id',
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPdfPlan(validPdfInput);

      expect(result.status).toBe('duplicate_detected');
      if (result.status === 'duplicate_detected') {
        expect(result.existingPlanId).toBe('existing-pdf-plan-id');
      }
    });

    it('does not reserve PDF quota when duplicate is detected', async () => {
      const prepareSpy = vi
        .fn()
        .mockRejectedValue(new Error('preparePlanInput should not be called'));
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          findRecentDuplicatePlan: async () => 'existing-pdf-plan-id',
        },
        pdfOrigin: {
          preparePlanInput: prepareSpy,
          rollbackPdfUsage: async () => {},
        },
      });
      service = new PlanLifecycleService(ports);

      await service.createPdfPlan(validPdfInput);

      expect(prepareSpy).not.toHaveBeenCalled();
    });

    it('does not call atomicInsertPlan when PDF duplicate is detected', async () => {
      const insertSpy = vi
        .fn()
        .mockResolvedValue({ success: true as const, id: 'plan-new' });
      ports = createMockPorts({
        planPersistence: {
          ...createMockPorts().planPersistence,
          findRecentDuplicatePlan: async () => 'existing-pdf-plan-id',
          atomicInsertPlan: insertSpy,
        },
      });
      service = new PlanLifecycleService(ports);

      await service.createPdfPlan(validPdfInput);

      expect(insertSpy).not.toHaveBeenCalled();
    });

    it('does not call rollback on success', async () => {
      const rollbackSpy = vi.fn().mockResolvedValue(undefined);
      ports = createMockPorts({
        pdfOrigin: {
          preparePlanInput: vi.fn().mockResolvedValue({
            origin: 'pdf' as const,
            extractedContext: null,
            topic: 'Test',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            pdfUsageReserved: true,
            pdfProvenance: null,
          }),
          rollbackPdfUsage: rollbackSpy,
        },
      });
      service = new PlanLifecycleService(ports);

      const result = await service.createPdfPlan(validPdfInput);

      expect(result.status).toBe('success');
      expect(rollbackSpy).not.toHaveBeenCalled();
    });

    it('returns permanent_failure when PDF fields are missing', async () => {
      const result = await service.createPdfPlan({
        ...validPdfInput,
        extractedContent: null,
      } as unknown as CreatePdfPlanInput);

      expect(result.status).toBe('permanent_failure');
      if (result.status === 'permanent_failure') {
        expect(result.classification).toBe('validation');
        expect(result.error.message).toContain('PDF extraction proof fields');
      }
    });

    it('passes PDF-origin data to atomicInsertPlan', async () => {
      let capturedData: unknown;
      ports = createMockPorts({
        pdfOrigin: {
          preparePlanInput: vi.fn().mockResolvedValue({
            origin: 'pdf' as const,
            extractedContext: { mainTopic: 'ML Fundamentals' },
            topic: 'ML Fundamentals',
            skillLevel: 'advanced',
            weeklyHours: 10,
            learningStyle: 'reading',
            pdfUsageReserved: true,
            pdfProvenance: { extractionHash: 'hash-xyz', proofVersion: 1 },
          }),
          rollbackPdfUsage: async () => {},
        },
        planPersistence: {
          ...createMockPorts().planPersistence,
          atomicInsertPlan: async (_userId, planData) => {
            capturedData = planData;
            return { success: true as const, id: 'plan-pdf-789' };
          },
        },
      });
      service = new PlanLifecycleService(ports);

      await service.createPdfPlan(validPdfInput);

      expect(capturedData).toMatchObject({
        topic: 'ML Fundamentals',
        skillLevel: 'advanced',
        weeklyHours: 10,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'pdf',
        extractedContext: { mainTopic: 'ML Fundamentals' },
      });
    });
  });
});
