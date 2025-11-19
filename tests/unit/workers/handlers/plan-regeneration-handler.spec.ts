/* eslint-disable @typescript-eslint/unbound-method */
import * as serviceRoleDb from '@/lib/db/service-role';
import { JOB_TYPES } from '@/lib/jobs/types';
import { PlanRegenerationHandler } from '@/workers/handlers/plan-regeneration-handler';
import { CurationService } from '@/workers/services/curation-service';
import { GenerationService } from '@/workers/services/generation-service';
import { PersistenceService } from '@/workers/services/persistence-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/service-role', () => ({
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
      expect(persistenceService.failJob).toHaveBeenCalledWith({
        jobId: 'job-123',
        planId: null,
        userId: 'user-123',
        error: 'Regeneration job missing planId',
        retryable: false,
      });
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
        expect(result.retryable).toBe(false);
      }
      expect(persistenceService.failJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-123',
          planId: 'plan-123',
          userId: 'user-123',
          retryable: false,
        })
      );
    });

    it('should reject when plan not found', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const findFirstMock = vi.mocked(
        serviceRoleDb.db.query.learningPlans.findFirst
      );
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
        expect(result.retryable).toBe(false);
      }
      expect(persistenceService.failJob).toHaveBeenCalledWith({
        jobId: 'job-123',
        planId: validUuid,
        userId: 'user-123',
        error: 'Plan not found for regeneration',
        retryable: false,
      });
    });

    it('should successfully regenerate plan with overrides', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const findFirstMock = vi.mocked(
        serviceRoleDb.db.query.learningPlans.findFirst
      );
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
      const findFirstMock = vi.mocked(
        serviceRoleDb.db.query.learningPlans.findFirst
      );
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

    describe('curation', () => {
      beforeEach(() => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        const findFirstMock = vi.mocked(
          serviceRoleDb.db.query.learningPlans.findFirst
        );
        findFirstMock.mockResolvedValue({
          id: validUuid,
          topic: 'Test Topic',
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
      });

      it('should run curation synchronously when shouldRunCuration and shouldRunSync are true', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        vi.spyOn(CurationService, 'shouldRunCuration').mockReturnValue(true);
        vi.spyOn(CurationService, 'shouldRunSync').mockReturnValue(true);
        vi.mocked(curationService.curateAndAttachResources).mockResolvedValue();

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

        expect(curationService.curateAndAttachResources).toHaveBeenCalledWith({
          planId: validUuid,
          topic: 'Test Topic',
          skillLevel: 'beginner',
        });
        expect(persistenceService.completeJob).toHaveBeenCalled();
      });

      it('should run curation asynchronously when shouldRunCuration is true but shouldRunSync is false', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        vi.spyOn(CurationService, 'shouldRunCuration').mockReturnValue(true);
        vi.spyOn(CurationService, 'shouldRunSync').mockReturnValue(false);
        vi.mocked(curationService.curateAndAttachResources).mockResolvedValue();

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

        expect(curationService.curateAndAttachResources).toHaveBeenCalledWith({
          planId: validUuid,
          topic: 'Test Topic',
          skillLevel: 'beginner',
        });
        expect(persistenceService.completeJob).toHaveBeenCalled();
      });

      it('should not run curation when shouldRunCuration is false', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        vi.spyOn(CurationService, 'shouldRunCuration').mockReturnValue(false);

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

        expect(curationService.curateAndAttachResources).not.toHaveBeenCalled();
        expect(persistenceService.completeJob).toHaveBeenCalled();
      });
    });

    describe('failure classification', () => {
      beforeEach(() => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        const findFirstMock = vi.mocked(
          serviceRoleDb.db.query.learningPlans.findFirst
        );
        findFirstMock.mockResolvedValue({
          id: validUuid,
          topic: 'Test Topic',
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
      });

      it('should handle validation failure as non-retryable and persist failure', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'failure',
          error: new Error('Invalid input'),
          classification: 'validation',
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
          expect(result.classification).toBe('validation');
          expect(result.retryable).toBe(false);
          expect(result.error).toBe('Invalid input');
        }
        expect(persistenceService.failJob).toHaveBeenCalledWith({
          jobId: 'job-123',
          planId: validUuid,
          userId: 'user-123',
          error: 'Invalid input',
          retryable: false,
          metadata: undefined,
        });
      });

      it('should handle capped failure as non-retryable and persist failure', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'failure',
          error: 'Usage limit reached',
          classification: 'capped',
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
          expect(result.classification).toBe('capped');
          expect(result.retryable).toBe(false);
          expect(result.error).toBe('Usage limit reached');
        }
        expect(persistenceService.failJob).toHaveBeenCalledWith({
          jobId: 'job-123',
          planId: validUuid,
          userId: 'user-123',
          error: 'Usage limit reached',
          retryable: false,
          metadata: undefined,
        });
      });

      it('should handle rate_limit failure as retryable without persisting', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'failure',
          error: new Error('Rate limit exceeded'),
          classification: 'rate_limit',
          metadata: {
            provider: 'openai',
            model: 'gpt-4o-mini',
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
          expect(result.classification).toBe('rate_limit');
          expect(result.retryable).toBe(true);
          expect(result.error).toBe('Rate limit exceeded');
        }
        expect(persistenceService.failJob).toHaveBeenCalledWith({
          jobId: 'job-123',
          planId: validUuid,
          userId: 'user-123',
          error: 'Rate limit exceeded',
          retryable: true,
          metadata: {
            provider: 'openai',
            model: 'gpt-4o-mini',
          },
        });
      });

      it('should handle provider_error failure as retryable without persisting', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'failure',
          error: new Error('Provider temporarily unavailable'),
          classification: 'provider_error',
          metadata: {
            provider: 'openai',
            model: 'gpt-4o-mini',
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
          expect(result.classification).toBe('provider_error');
          expect(result.retryable).toBe(true);
          expect(result.error).toBe('Provider temporarily unavailable');
        }
        expect(persistenceService.failJob).toHaveBeenCalledWith({
          jobId: 'job-123',
          planId: validUuid,
          userId: 'user-123',
          error: 'Provider temporarily unavailable',
          retryable: true,
          metadata: {
            provider: 'openai',
            model: 'gpt-4o-mini',
          },
        });
      });

      it('should handle unknown failure classification as retryable without persisting', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'failure',
          error: new Error('Unexpected error'),
          classification: 'unknown',
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
          expect(result.classification).toBe('unknown');
          expect(result.retryable).toBe(true);
          expect(result.error).toBe('Unexpected error');
        }
        expect(persistenceService.failJob).toHaveBeenCalledWith({
          jobId: 'job-123',
          planId: validUuid,
          userId: 'user-123',
          error: 'Unexpected error',
          retryable: true,
          metadata: undefined,
        });
      });
    });
  });
});
