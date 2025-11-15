import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerationService } from '@/workers/services/generation-service';
import { createMockProvider } from '../../../helpers/mockProvider';
import * as orchestrator from '@/lib/ai/orchestrator';

vi.mock('@/lib/ai/orchestrator', () => ({
  runGenerationAttempt: vi.fn(),
}));

describe('GenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generatePlan', () => {
    it('should return success result when generation succeeds', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new GenerationService(mockProvider.provider);

      const mockAttempt = { id: 'attempt-123' };
      const mockModules = [
        {
          title: 'Module 1',
          estimatedMinutes: 120,
          tasks: [
            { title: 'Task 1', estimatedMinutes: 60 },
            { title: 'Task 2', estimatedMinutes: 60 },
          ],
        },
      ];

      vi.mocked(orchestrator.runGenerationAttempt).mockResolvedValue({
        status: 'success',
        classification: null,
        modules: mockModules,
        rawText: 'mock raw text',
        metadata: {
          provider: 'mock-ai',
          model: 'mock-model',
          usage: {
            promptTokens: 100,
            completionTokens: 200,
          },
        },
        durationMs: 5000,
        extendedTimeout: false,
        timedOut: false,
        attempt: {
          id: mockAttempt.id,
          planId: 'plan-123',
          status: 'success',
          classification: null,
          durationMs: 5000,
          modulesCount: 1,
          tasksCount: 2,
          truncatedTopic: false,
          truncatedNotes: false,
          normalizedEffort: false,
          promptHash: null,
          metadata: null,
          createdAt: new Date(),
        },
      });

      const result = await service.generatePlan(
        {
          topic: 'Machine Learning',
          notes: null,
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          startDate: null,
          deadlineDate: null,
        },
        {
          planId: 'plan-123',
          userId: 'user-123',
        }
      );

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.modules).toEqual(mockModules);
        expect(result.durationMs).toBe(5000);
        expect(result.attemptId).toBe('attempt-123');
        expect(result.metadata?.provider).toBe('mock-ai');
      }
    });

    it('should return failure result with classification when generation fails', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new GenerationService(mockProvider.provider);

      vi.mocked(orchestrator.runGenerationAttempt).mockResolvedValue({
        status: 'failure',
        classification: 'validation',
        error: new Error('Validation failed'),
        metadata: {
          provider: 'mock-ai',
          model: 'mock-model',
        },
        durationMs: 1000,
        extendedTimeout: false,
        timedOut: false,
        attempt: {
          id: 'attempt-456',
          planId: 'plan-123',
          status: 'failure',
          classification: 'validation',
          durationMs: 1000,
          modulesCount: 0,
          tasksCount: 0,
          truncatedTopic: false,
          truncatedNotes: false,
          normalizedEffort: false,
          promptHash: null,
          metadata: null,
          createdAt: new Date(),
        },
      });

      const result = await service.generatePlan(
        {
          topic: 'Machine Learning',
          notes: null,
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          startDate: null,
          deadlineDate: null,
        },
        {
          planId: 'plan-123',
          userId: 'user-123',
        }
      );

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.classification).toBe('validation');
        expect(result.error).toBeInstanceOf(Error);
        expect((result.error as Error).message).toBe('Validation failed');
      }
    });

    it('should handle string errors from orchestrator', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new GenerationService(mockProvider.provider);

      vi.mocked(orchestrator.runGenerationAttempt).mockResolvedValue({
        status: 'failure',
        classification: 'provider_error',
        error: 'String error message',
        durationMs: 1500,
        extendedTimeout: false,
        timedOut: false,
        attempt: {
          id: 'attempt-789',
          planId: 'plan-123',
          status: 'failure',
          classification: 'provider_error',
          durationMs: 1500,
          modulesCount: 0,
          tasksCount: 0,
          truncatedTopic: false,
          truncatedNotes: false,
          normalizedEffort: false,
          promptHash: null,
          metadata: null,
          createdAt: new Date(),
        },
      });

      const result = await service.generatePlan(
        {
          topic: 'Machine Learning',
          notes: null,
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          startDate: null,
          deadlineDate: null,
        },
        {
          planId: 'plan-123',
          userId: 'user-123',
        }
      );

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.classification).toBe('provider_error');
        expect(result.error).toBe('String error message');
      }
    });

    it('should handle unexpected errors from orchestrator', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new GenerationService(mockProvider.provider);

      vi.mocked(orchestrator.runGenerationAttempt).mockRejectedValue(
        new Error('Unexpected error')
      );

      const result = await service.generatePlan(
        {
          topic: 'Machine Learning',
          notes: null,
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          startDate: null,
          deadlineDate: null,
        },
        {
          planId: 'plan-123',
          userId: 'user-123',
        }
      );

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.classification).toBe('unknown');
        expect(result.error).toBeInstanceOf(Error);
        expect((result.error as Error).message).toBe('Unexpected error');
      }
    });

    it('should pass abort signal to orchestrator', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new GenerationService(mockProvider.provider);

      const abortController = new AbortController();
      vi.mocked(orchestrator.runGenerationAttempt).mockResolvedValue({
        status: 'success',
        classification: null,
        modules: [],
        rawText: 'mock raw text',
        metadata: {
          provider: 'mock-ai',
          model: 'mock-model',
        },
        durationMs: 1000,
        extendedTimeout: false,
        timedOut: false,
        attempt: {
          id: 'attempt-123',
          planId: 'plan-123',
          status: 'success',
          classification: null,
          durationMs: 1000,
          modulesCount: 0,
          tasksCount: 0,
          truncatedTopic: false,
          truncatedNotes: false,
          normalizedEffort: false,
          promptHash: null,
          metadata: null,
          createdAt: new Date(),
        },
      });

      await service.generatePlan(
        {
          topic: 'Machine Learning',
          notes: null,
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          startDate: null,
          deadlineDate: null,
        },
        {
          planId: 'plan-123',
          userId: 'user-123',
          signal: abortController.signal,
        }
      );

      expect(orchestrator.runGenerationAttempt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          signal: abortController.signal,
        })
      );
    });
  });
});
