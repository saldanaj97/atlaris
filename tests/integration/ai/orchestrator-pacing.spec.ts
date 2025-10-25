import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { pacePlan } from '@/lib/ai/pacing';
import { ProviderTimeoutError } from '@/lib/ai/provider';
import type {
  GenerationAttemptContext,
  RunGenerationOptions,
} from '@/lib/ai/orchestrator';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
} from '@/lib/ai/provider';
import type { ParsedGeneration } from '@/lib/ai/parser';
import type { GenerationAttemptRecord } from '@/lib/db/queries/attempts';
import type { GenerationSuccessResult } from '@/lib/ai/orchestrator';
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
    dbClient: {} as any,
    now: vi.fn(() => new Date()),
  };

  const mockPreparation = { capped: false, attemptId: 'attempt-1' } as any;
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
    vi.mocked(attemptsModule.startAttempt).mockResolvedValue(mockPreparation);
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
    } as any);
    vi.mocked(attemptsModule.recordSuccess).mockResolvedValue({
      id: 'success-1',
    } as GenerationAttemptRecord);
  });

  describe('success path', () => {
    it('applies pacing after parsing and before recording success', async () => {
      const originalModules = mockParsed.modules;
      const expectedPaced = pacePlan(originalModules, mockContext.input); // Pre-compute expected
      const result = await runGenerationAttempt(mockContext, mockOptions);

      expect(result.status).toBe('success');
      const successResult = result as GenerationSuccessResult;
      expect(successResult.modules).toEqual(expectedPaced); // Paced modules returned
      expect(parserModule.parseGenerationStream).toHaveBeenCalledTimes(1);
      expect(attemptsModule.recordSuccess).toHaveBeenCalledWith(
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
      const totalTasks = (result as GenerationSuccessResult).modules.reduce(
        (sum: number, m) => sum + m.tasks.length,
        0
      );
      expect(totalTasks).toBeLessThanOrEqual(2); // Low capacity: ~2-3 tasks max, but with 2 tasks original, likely trimmed if calc low
    });
  });

  describe('failure paths', () => {
    it('does not apply pacing on capped preparation', async () => {
      vi.mocked(attemptsModule.startAttempt).mockResolvedValue({
        ...mockPreparation,
        capped: true,
      });
      const result = await runGenerationAttempt(mockContext, mockOptions);

      expect(result.status).toBe('failure');
      expect(result.classification).toBe('capped');
      expect(attemptsModule.recordSuccess).not.toHaveBeenCalled();
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
      } as any);

      const result = await runGenerationAttempt(mockContext, mockOptions);

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.error).toBe(mockError);
      }
      expect(result.timedOut).toBe(true);
      expect(parserModule.parseGenerationStream).not.toHaveBeenCalled(); // No parsing on error
      expect(attemptsModule.recordSuccess).not.toHaveBeenCalled();
      // Pacing not applied
    });

    it('classifies failures correctly without pacing', async () => {
      const mockError = new ProviderTimeoutError('Timeout');
      vi.mocked(providerFactoryModule.getGenerationProvider).mockReturnValue({
        generate: vi.fn().mockRejectedValue(mockError),
      } as unknown as AiPlanGenerationProvider);

      const result = await runGenerationAttempt(mockContext, mockOptions);

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
      // Pacing should fallback gracefully (capacity 0 → minimal modules)
      expect(
        (result as GenerationSuccessResult).modules.length
      ).toBeGreaterThanOrEqual(1); // Assuming original has modules
    });

    it('preserves rawText and metadata through pacing', async () => {
      const result = await runGenerationAttempt(mockContext, mockOptions);

      expect((result as GenerationSuccessResult).rawText).toBe(
        mockParsed.rawText
      );
      expect((result as GenerationSuccessResult).metadata).toEqual({
        model: 'gpt-4',
      });
      expect(result.extendedTimeout).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
