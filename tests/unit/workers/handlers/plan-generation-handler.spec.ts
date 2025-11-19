/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanGenerationHandler } from '@/workers/handlers/plan-generation-handler';
import { GenerationService } from '@/workers/services/generation-service';
import { CurationService } from '@/workers/services/curation-service';
import { PersistenceService } from '@/workers/services/persistence-service';
import { JOB_TYPES } from '@/lib/jobs/types';

describe('PlanGenerationHandler', () => {
  let generationService: GenerationService;
  let curationService: CurationService;
  let persistenceService: PersistenceService;
  let handler: PlanGenerationHandler;

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
    handler = new PlanGenerationHandler(
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
        type: JOB_TYPES.PLAN_REGENERATION, // Wrong type
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
        expect(result.classification).toBe('unknown');
      }
    });

    it('should reject job without planId', async () => {
      const result = await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_GENERATION,
        planId: null,
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {
          topic: 'TypeScript',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
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
        expect(result.error).toContain('missing a planId');
        expect(result.classification).toBe('validation');
        expect(result.retryable).toBe(false);
      }
      expect(persistenceService.failJob).toHaveBeenCalledWith({
        jobId: 'job-123',
        planId: null,
        userId: 'user-123',
        error: 'Plan generation job is missing a planId.',
        retryable: false,
      });
    });

    it('should reject invalid job data with validation errors', async () => {
      const result = await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_GENERATION,
        planId: 'plan-123',
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {
          topic: 'ab', // Too short (< 3 characters)
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
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
        expect(result.error).toContain('topic must be at least 3 characters');
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

    it('should reject job data with invalid skill level', async () => {
      const result = await handler.processJob({
        id: 'job-123',
        type: JOB_TYPES.PLAN_GENERATION,
        planId: 'plan-123',
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {
          topic: 'TypeScript',
          skillLevel: 'expert', // Invalid skill level
          weeklyHours: 5,
          learningStyle: 'mixed',
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
      }
      expect(persistenceService.failJob).toHaveBeenCalled();
    });

    it('should successfully generate a plan', async () => {
      vi.mocked(generationService.generatePlan).mockResolvedValue({
        status: 'success',
        modules: [
          {
            title: 'Module 1',
            description: 'Introduction to TypeScript',
            estimatedMinutes: 120,
            tasks: [
              { title: 'Task 1', estimatedMinutes: 60 },
              { title: 'Task 2', estimatedMinutes: 60 },
            ],
          },
          {
            title: 'Module 2',
            estimatedMinutes: 180,
            tasks: [{ title: 'Task 3', estimatedMinutes: 180 }],
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
        type: JOB_TYPES.PLAN_GENERATION,
        planId: 'plan-123',
        userId: 'user-123',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {
          topic: 'TypeScript',
          notes: 'Focus on advanced features',
          skillLevel: 'intermediate',
          weeklyHours: 10,
          learningStyle: 'mixed',
          startDate: '2024-01-01',
          deadlineDate: '2024-12-31',
        },
        result: null,
        error: null,
        processingStartedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.result.modulesCount).toBe(2);
        expect(result.result.tasksCount).toBe(3);
        expect(result.result.durationMs).toBe(5000);
        expect(result.result.metadata).toBeDefined();
        expect(result.result.metadata?.provider).toEqual({
          provider: 'openai',
          model: 'gpt-4o-mini',
          usage: {
            promptTokens: 100,
            completionTokens: 200,
          },
        });
        expect(result.result.metadata?.attemptId).toBe('attempt-123');
      }

      expect(generationService.generatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'TypeScript',
          notes: 'Focus on advanced features',
          skillLevel: 'intermediate',
          weeklyHours: 10,
          learningStyle: 'mixed',
          startDate: '2024-01-01',
          deadlineDate: '2024-12-31',
        }),
        expect.objectContaining({
          planId: 'plan-123',
          userId: 'user-123',
        })
      );

      expect(persistenceService.completeJob).toHaveBeenCalledWith({
        jobId: 'job-123',
        planId: 'plan-123',
        userId: 'user-123',
        result: expect.objectContaining({
          modulesCount: 2,
          tasksCount: 3,
        }),
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

    it('should handle null notes and dates correctly', async () => {
      vi.mocked(generationService.generatePlan).mockResolvedValue({
        status: 'success',
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 120,
            tasks: [{ title: 'Task 1', estimatedMinutes: 120 }],
          },
        ],
        durationMs: 3000,
        attemptId: 'attempt-456',
      });

      const result = await handler.processJob({
        id: 'job-456',
        type: JOB_TYPES.PLAN_GENERATION,
        planId: 'plan-456',
        userId: 'user-456',
        status: 'processing',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        data: {
          topic: 'Python',
          notes: null,
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          startDate: null,
          deadlineDate: null,
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
          notes: null,
          startDate: null,
          deadlineDate: null,
        }),
        expect.anything()
      );
    });

    describe('curation', () => {
      beforeEach(() => {
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
        vi.spyOn(CurationService, 'shouldRunCuration').mockReturnValue(true);
        vi.spyOn(CurationService, 'shouldRunSync').mockReturnValue(true);
        vi.mocked(curationService.curateAndAttachResources).mockResolvedValue();

        await handler.processJob({
          id: 'job-123',
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'TypeScript',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
          },
          result: null,
          error: null,
          processingStartedAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        expect(curationService.curateAndAttachResources).toHaveBeenCalledWith({
          planId: 'plan-123',
          topic: 'TypeScript',
          skillLevel: 'beginner',
        });
        expect(persistenceService.completeJob).toHaveBeenCalled();
      });

      it('should run curation asynchronously when shouldRunCuration is true but shouldRunSync is false', async () => {
        vi.spyOn(CurationService, 'shouldRunCuration').mockReturnValue(true);
        vi.spyOn(CurationService, 'shouldRunSync').mockReturnValue(false);
        vi.mocked(curationService.curateAndAttachResources).mockResolvedValue();

        await handler.processJob({
          id: 'job-123',
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'React',
            skillLevel: 'intermediate',
            weeklyHours: 8,
            learningStyle: 'video',
          },
          result: null,
          error: null,
          processingStartedAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        expect(curationService.curateAndAttachResources).toHaveBeenCalledWith({
          planId: 'plan-123',
          topic: 'React',
          skillLevel: 'intermediate',
        });
        expect(persistenceService.completeJob).toHaveBeenCalled();
      });

      it('should not run curation when shouldRunCuration is false', async () => {
        vi.spyOn(CurationService, 'shouldRunCuration').mockReturnValue(false);

        await handler.processJob({
          id: 'job-123',
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'Python',
            skillLevel: 'advanced',
            weeklyHours: 12,
            learningStyle: 'practice',
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

      it('should not fail job if curation fails', async () => {
        vi.spyOn(CurationService, 'shouldRunCuration').mockReturnValue(true);
        vi.spyOn(CurationService, 'shouldRunSync').mockReturnValue(true);
        vi.mocked(curationService.curateAndAttachResources).mockRejectedValue(
          new Error('Curation service unavailable')
        );

        const result = await handler.processJob({
          id: 'job-123',
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'Golang',
            skillLevel: 'beginner',
            weeklyHours: 6,
            learningStyle: 'reading',
          },
          result: null,
          error: null,
          processingStartedAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Job should still complete successfully despite curation failure
        expect(result.status).toBe('success');
        expect(persistenceService.completeJob).toHaveBeenCalled();
      });
    });

    describe('failure classification', () => {
      it('should handle validation failure as non-retryable', async () => {
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'failure',
          error: new Error('Invalid input'),
          classification: 'validation',
        });

        const result = await handler.processJob({
          id: 'job-123',
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'JavaScript',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
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
          planId: 'plan-123',
          userId: 'user-123',
          error: 'Invalid input',
          retryable: false,
          metadata: undefined,
        });
      });

      it('should handle capped failure as non-retryable', async () => {
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'failure',
          error: 'Usage limit reached',
          classification: 'capped',
        });

        const result = await handler.processJob({
          id: 'job-123',
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'Rust',
            skillLevel: 'advanced',
            weeklyHours: 10,
            learningStyle: 'practice',
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
          planId: 'plan-123',
          userId: 'user-123',
          error: 'Usage limit reached',
          retryable: false,
          metadata: undefined,
        });
      });

      it('should handle rate_limit failure as retryable', async () => {
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
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'Kubernetes',
            skillLevel: 'intermediate',
            weeklyHours: 8,
            learningStyle: 'mixed',
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
          planId: 'plan-123',
          userId: 'user-123',
          error: 'Rate limit exceeded',
          retryable: true,
          metadata: {
            provider: 'openai',
            model: 'gpt-4o-mini',
          },
        });
      });

      it('should handle provider_error failure as retryable', async () => {
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
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'Docker',
            skillLevel: 'beginner',
            weeklyHours: 4,
            learningStyle: 'video',
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
          planId: 'plan-123',
          userId: 'user-123',
          error: 'Provider temporarily unavailable',
          retryable: true,
          metadata: {
            provider: 'openai',
            model: 'gpt-4o-mini',
          },
        });
      });

      it('should handle unknown failure classification as retryable', async () => {
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'failure',
          error: new Error('Unexpected error'),
          classification: 'unknown',
        });

        const result = await handler.processJob({
          id: 'job-123',
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'Machine Learning',
            skillLevel: 'advanced',
            weeklyHours: 15,
            learningStyle: 'practice',
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
          planId: 'plan-123',
          userId: 'user-123',
          error: 'Unexpected error',
          retryable: true,
          metadata: undefined,
        });
      });

      it('should handle unexpected exceptions as retryable', async () => {
        vi.mocked(generationService.generatePlan).mockRejectedValue(
          new Error('Database connection failed')
        );

        const result = await handler.processJob({
          id: 'job-123',
          type: JOB_TYPES.PLAN_GENERATION,
          planId: 'plan-123',
          userId: 'user-123',
          status: 'processing',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          data: {
            topic: 'AWS',
            skillLevel: 'intermediate',
            weeklyHours: 7,
            learningStyle: 'reading',
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
          expect(result.error).toBe('Database connection failed');
        }
        expect(persistenceService.failJob).toHaveBeenCalledWith({
          jobId: 'job-123',
          planId: 'plan-123',
          userId: 'user-123',
          error: 'Database connection failed',
          retryable: true,
        });
      });
    });

    describe('abort signal', () => {
      it('should pass abort signal to generation service', async () => {
        vi.mocked(generationService.generatePlan).mockResolvedValue({
          status: 'success',
          modules: [
            {
              title: 'Module 1',
              estimatedMinutes: 120,
              tasks: [{ title: 'Task 1', estimatedMinutes: 120 }],
            },
          ],
          durationMs: 3000,
          attemptId: 'attempt-789',
        });

        const abortController = new AbortController();
        await handler.processJob(
          {
            id: 'job-123',
            type: JOB_TYPES.PLAN_GENERATION,
            planId: 'plan-123',
            userId: 'user-123',
            status: 'processing',
            priority: 0,
            attempts: 0,
            maxAttempts: 3,
            data: {
              topic: 'GraphQL',
              skillLevel: 'beginner',
              weeklyHours: 5,
              learningStyle: 'mixed',
            },
            result: null,
            error: null,
            processingStartedAt: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { signal: abortController.signal }
        );

        expect(generationService.generatePlan).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            signal: abortController.signal,
          })
        );
      });
    });
  });
});
