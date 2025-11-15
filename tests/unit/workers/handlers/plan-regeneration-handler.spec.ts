/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanRegenerationHandler } from '@/workers/handlers/plan-regeneration-handler';
import { GenerationService } from '@/workers/services/generation-service';
import { CurationService } from '@/workers/services/curation-service';
import { PersistenceService } from '@/workers/services/persistence-service';
import { JOB_TYPES } from '@/lib/jobs/types';
import * as drizzle from '@/lib/db/drizzle';

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    query: {
      learningPlans: {
        findFirst: vi.fn(),
      },
    },
  },
}));

describe('PlanRegenerationHandler', () => {
  let generationService: GenerationService;
  let curationService: CurationService;
  let persistenceService: PersistenceService;
  let handler: PlanRegenerationHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    generationService = {
      generatePlan: vi.fn(),
    } as unknown as GenerationService;
    curationService = {
      curateAndAttachResources: vi.fn(),
    } as unknown as CurationService;
    persistenceService = {
      completeJob: vi.fn(),
      failJob: vi.fn(),
    } as unknown as PersistenceService;
    handler = new PlanRegenerationHandler(
      generationService,
      curationService,
      persistenceService
    );

    // Mock static methods
    vi.spyOn(CurationService, 'shouldRunCuration').mockReturnValue(false);
  });

  describe('processJob', () => {
    it('should reject unsupported job type', async () => {
      const result = await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_GENERATION, // Wrong type
        planId: 'plan-123',
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {},
        result: null,
        error: null,
        processingStartedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.error).toContain('Unsupported job type');
        expect(result.retryable).toBe(false);
      }
    });

    it('should reject job without planId', async () => {
      const result = await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_REGENERATION,
        planId: null,
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {},
        result: null,
        error: null,
        processingStartedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.error).toContain('missing planId');
        expect(result.classification).toBe('validation');
      }
    });

    it('should reject invalid job data', async () => {
      const result = await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_REGENERATION,
        planId: 'plan-123',
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: { invalidField: 'value' },
        result: null,
        error: null,
        processingStartedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.classification).toBe('validation');
      }
    });

    it('should reject when plan not found', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const findFirstMock = vi.mocked(drizzle.db.query.learningPlans.findFirst);
      findFirstMock.mockResolvedValue(undefined as any);

      const result = await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_REGENERATION,
        planId: validUuid,
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {
          planId: validUuid,
        },
        result: null,
        error: null,
        processingStartedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.error).toContain('not found');
        expect(result.classification).toBe('validation');
      }
    });

    it('should successfully regenerate plan with overrides', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const findFirstMock = vi.mocked(drizzle.db.query.learningPlans.findFirst);
      findFirstMock.mockResolvedValue({
        id: validUuid,
        topic: 'Original Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        startDate: null,
        deadlineDate: null,
        userId: 'user-123',
        status: 'generating',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(generationService.generatePlan).mockResolvedValue({
        status: 'success',
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 120,
            tasks: [{ title: 'Task 1', estimatedMinutes: 60 }],
          },
        ],
        durationMs: 5000,
        attemptId: 'attempt-123',
        metadata: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          usage: {
            promptTokens: 100,
            completionTokens: 200,
          },
        },
      });

      const result = await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_REGENERATION,
        planId: validUuid,
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {
          planId: validUuid,
          overrides: {
            topic: 'New Topic',
            skillLevel: 'advanced' as const,
          },
        },
        result: null,
        error: null,
        processingStartedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result.status).toBe('success');
      expect(generationService.generatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'New Topic',
          skillLevel: 'advanced',
          weeklyHours: 5,
        }),
        expect.anything()
      );
      expect(persistenceService.completeJob).toHaveBeenCalled();
    });

    it('should use existing plan values when no overrides provided', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const findFirstMock = vi.mocked(drizzle.db.query.learningPlans.findFirst);
      findFirstMock.mockResolvedValue({
        id: validUuid,
        topic: 'Original Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        startDate: null,
        deadlineDate: null,
        userId: 'user-123',
        status: 'generating',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(generationService.generatePlan).mockResolvedValue({
        status: 'success',
        modules: [],
        durationMs: 5000,
        attemptId: 'attempt-123',
      });

      await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_REGENERATION,
        planId: validUuid,
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {
          planId: validUuid,
        },
        result: null,
        error: null,
        processingStartedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(generationService.generatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'Original Topic',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
        }),
        expect.anything()
      );
    });
  });
});
