import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { pacePlan } from '@/lib/ai/pacing';
import { ProviderTimeoutError } from '@/lib/ai/provider';
import type {
  GenerationAttemptContext,
  GenerationFailureResult,
  GenerationSuccessResult,
  RunGenerationOptions,
} from '@/lib/ai/orchestrator';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
} from '@/lib/ai/types/provider.types';
import type { ParsedGeneration } from '@/lib/ai/parser';
import type {
  AttemptReservation,
  GenerationAttemptRecord,
} from '@/lib/db/queries/attempts';
import * as attemptsModule from '@/lib/db/queries/attempts';
import * as providerFactoryModule from '@/lib/ai/provider-factory';
import * as parserModule from '@/lib/ai/parser';
import * as timeoutModule from '@/lib/ai/timeout';

vi.mock('@/lib/db/queries/attempts');
vi.mock('@/lib/ai/provider-factory');
vi.mock('@/lib/ai/parser');
vi.mock('@/lib/ai/timeout');

describe('orchestrator pacing integration', () => {
  const mockContext: GenerationAttemptContext = {
    planId: 'plan-123',
    userId: 'user-123',
    input: {
      topic: 'Test Topic',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      startDate: '2024-01-01',
      deadlineDate: '2024-01-29',
    } as GenerationInput,
  };

  const mockOptions: RunGenerationOptions = {
    clock: vi.fn(() => Date.now()),
    dbClient: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    } as unknown as RunGenerationOptions['dbClient'],
    now: vi.fn(() => new Date()),
  };

  const mockReservation: AttemptReservation = {
    reserved: true,
    attemptId: 'attempt-1',
    attemptNumber: 1,
    startedAt: new Date('2024-01-01T00:00:00.000Z'),
    sanitized: {
      topic: {
        value: 'Test Topic',
        truncated: false,
        originalLength: 10,
      },
      notes: {
        value: undefined,
        truncated: false,
        originalLength: undefined,
      },
    },
    promptHash: 'hash_123',
  };
  const mockProviderResult = {
    stream: vi.fn(async () => 'mock stream text'),
    metadata: { model: 'gpt-4' },
  };
  const mockParsed: ParsedGeneration = {
    modules: [
      {
        title: 'Module 1',
        description: 'Desc 1',
        estimatedMinutes: 90,
        tasks: [
          {
            title: 'Task 1',
            description: 'Task desc',
            estimatedMinutes: 45,
          },
          {
            title: 'Task 2',
            description: 'Task desc',
            estimatedMinutes: 45,
          },
        ],
      },
    ],
    rawText: 'raw plan text',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(attemptsModule.isAttemptsDbClient).mockReturnValue(true);
    vi.mocked(attemptsModule.reserveAttemptSlot).mockResolvedValue(
      mockReservation
    );
    vi.mocked(providerFactoryModule.getGenerationProvider).mockReturnValue({
      generate: vi.fn().mockResolvedValue(mockProviderResult),
    } as unknown as AiPlanGenerationProvider);
    vi.mocked(parserModule.parseGenerationStream).mockResolvedValue(mockParsed);
    vi.mocked(timeoutModule.createAdaptiveTimeout).mockReturnValue({
      signal: { aborted: false },
      notifyFirstModule: vi.fn(),
      cancel: vi.fn(),
      timedOut: false,
      didExtend: false,
    } as unknown as ReturnType<typeof timeoutModule.createAdaptiveTimeout>);
    vi.mocked(attemptsModule.finalizeAttemptSuccess).mockResolvedValue({
      id: 'success-1',
      planId: 'plan-123',
      status: 'success',
      classification: null,
      durationMs: 1,
      modulesCount: 1,
      tasksCount: 2,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: 'hash_123',
      metadata: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    } as GenerationAttemptRecord);
    vi.mocked(attemptsModule.finalizeAttemptFailure).mockResolvedValue({
      id: 'failure-1',
      planId: 'plan-123',
      status: 'failure',
      classification: 'timeout',
      durationMs: 1,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: 'hash_123',
      metadata: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    } as GenerationAttemptRecord);
  });

  describe('success path', () => {
    it('applies pacing after parsing and before recording success', async () => {
      const originalModules = mockParsed.modules;
      const expectedPaced = pacePlan(originalModules, mockContext.input); // Pre-compute expected
      const result = await runGenerationAttempt(mockContext, mockOptions);

      expect(result.status).toBe('success');
      if (result.status !== 'success') {
        throw new Error('Expected success result');
      }
      const successResult: GenerationSuccessResult = result;
      expect(successResult.modules).toEqual(expectedPaced); // Paced modules returned
      expect(parserModule.parseGenerationStream).toHaveBeenCalledTimes(1);
      expect(attemptsModule.finalizeAttemptSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          modules: expectedPaced, // Paced passed to DB
          providerMetadata: { model: 'gpt-4' },
          durationMs: expect.any(Number),
          extendedTimeout: false,
        })
      );
      expect(successResult.rawText).toBe(mockParsed.rawText);
    });

    it('handles low capacity by trimming appropriately', async () => {
      // Mock with more tasks to demonstrate trimming
      vi.mocked(parserModule.parseGenerationStream).mockResolvedValue({
        ...mockParsed,
        modules: [
          {
            title: 'Module 1',
            description: 'Desc 1',
            estimatedMinutes: 180,
            tasks: [
              {
                title: 'Task 1',
                description: 'Task desc',
                estimatedMinutes: 45,
              },
              {
                title: 'Task 2',
                description: 'Task desc',
                estimatedMinutes: 45,
              },
              {
                title: 'Task 3',
                description: 'Task desc',
                estimatedMinutes: 45,
              },
              {
                title: 'Task 4',
                description: 'Task desc',
                estimatedMinutes: 45,
              },
            ],
          },
        ],
        rawText: 'raw plan text',
      });

      const lowInputContext = {
        ...mockContext,
        input: {
          ...mockContext.input,
          weeklyHours: 1,
          deadlineDate: '2024-01-08',
        },
      };
      const result = await runGenerationAttempt(lowInputContext, mockOptions);

      expect(result.status).toBe('success');
      if (result.status !== 'success') {
        throw new Error('Expected success result');
      }
      const totalTasks = result.modules.reduce(
        (sum: number, m) => sum + m.tasks.length,
        0
      );
      // 1 week, 1 hour/week, 45 min/task → ~1 task capacity
      expect(totalTasks).toBeLessThanOrEqual(2);
      expect(totalTasks).toBeLessThan(4); // Verify trimming occurred
    });
  });

  describe('failure paths', () => {
    it('does not apply pacing on capped preparation', async () => {
      vi.mocked(attemptsModule.reserveAttemptSlot).mockResolvedValue({
        reserved: false,
        reason: 'capped',
      });
      const result = await runGenerationAttempt(mockContext, mockOptions);

      expect(result.status).toBe('failure');
      expect(result.classification).toBe('capped');
      expect(attemptsModule.finalizeAttemptSuccess).not.toHaveBeenCalled();
      expect(attemptsModule.finalizeAttemptFailure).not.toHaveBeenCalled();
      expect(parserModule.parseGenerationStream).not.toHaveBeenCalled(); // No parsing if capped early
      // No pacing applied
    });

    it('does not apply pacing on provider failure/timeout', async () => {
      const mockError = new ProviderTimeoutError('Provider failed');
      vi.mocked(providerFactoryModule.getGenerationProvider).mockReturnValue({
        generate: vi.fn().mockRejectedValue(mockError),
      } as unknown as AiPlanGenerationProvider);

      vi.mocked(timeoutModule.createAdaptiveTimeout).mockReturnValue({
        signal: { aborted: false },
        notifyFirstModule: vi.fn(),
        cancel: vi.fn(),
        timedOut: true,
        didExtend: false,
      } as unknown as ReturnType<typeof timeoutModule.createAdaptiveTimeout>);

      const result = await runGenerationAttempt(mockContext, mockOptions);

      expect(result.status).toBe('failure');
      if (result.status !== 'failure') {
        throw new Error('Expected failure result');
      }
      const failureResult: GenerationFailureResult = result;
      expect(failureResult.error).toBe(mockError);
      expect(result.timedOut).toBe(true);
      expect(parserModule.parseGenerationStream).not.toHaveBeenCalled(); // No parsing on error
      expect(attemptsModule.finalizeAttemptSuccess).not.toHaveBeenCalled();
      // Pacing not applied
    });

    it('classifies failures correctly without pacing', async () => {
      const mockError = new ProviderTimeoutError('Timeout');
      vi.mocked(providerFactoryModule.getGenerationProvider).mockReturnValue({
        generate: vi.fn().mockRejectedValue(mockError),
      } as unknown as AiPlanGenerationProvider);

      const result = await runGenerationAttempt(mockContext, mockOptions);

      if (result.status !== 'failure') {
        throw new Error('Expected failure result');
      }
      expect(result.classification).toBe('timeout'); // Assuming classifyFailure logic
      expect(result.status).toBe('failure'); // No modules in failure
    });
  });

  describe('input variations', () => {
    it('handles null dates in input', async () => {
      const nullDateContext = {
        ...mockContext,
        input: { ...mockContext.input, startDate: null, deadlineDate: null },
      };
      const result = await runGenerationAttempt(nullDateContext, mockOptions);

      expect(result.status).toBe('success');
      if (result.status !== 'success') {
        throw new Error('Expected success result');
      }
      // With no deadline, pacing should not trim the plan
      expect(result.modules).toEqual(mockParsed.modules);
    });

    it('preserves rawText and metadata through pacing', async () => {
      const result = await runGenerationAttempt(mockContext, mockOptions);

      if (result.status !== 'success') {
        throw new Error('Expected success result');
      }
      expect(result.rawText).toBe(mockParsed.rawText);
      expect(result.metadata).toEqual({
        model: 'gpt-4',
      });
      expect(result.extendedTimeout).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
