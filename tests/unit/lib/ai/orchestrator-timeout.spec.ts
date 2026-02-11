import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import type { AiPlanGenerationProvider, GenerationInput } from '@/lib/ai/provider';
import { ProviderTimeoutError } from '@/lib/ai/provider';

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

const mockProvider: AiPlanGenerationProvider = {
  generate: vi.fn(),
};

const mockInput: GenerationInput = {
  topic: 'TypeScript',
  notes: null,
  pdfContext: null,
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  startDate: null,
  deadlineDate: null,
};

describe('orchestrator - timeout handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock startAttempt to return successful preparation
    mockDb.returning.mockResolvedValue([
      {
        id: 'attempt-123',
        planId: 'plan-456',
        userId: 'user-789',
        status: 'pending',
        createdAt: new Date(),
      },
    ]);
  });

  it('classifies timeout errors correctly', async () => {
    mockProvider.generate = vi
      .fn()
      .mockRejectedValue(new ProviderTimeoutError('Request timed out'));

    const result = await runGenerationAttempt(
      {
        planId: 'plan-456',
        userId: 'user-789',
        input: mockInput,
      },
      {
        provider: mockProvider,
        dbClient: mockDb as any,
        timeoutConfig: { baseMs: 100 },
      }
    );

    expect(result.status).toBe('failure');
    expect(result.classification).toBe('timeout');
    expect(result.timedOut).toBe(true);
  });

  it('handles abort signal timeout', async () => {
    const controller = new AbortController();

    mockProvider.generate = vi.fn().mockImplementation(async () => {
      // Simulate timeout by aborting
      setTimeout(() => controller.abort(), 50);
      await new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('Aborted'));
        });
      });
    });

    const result = await runGenerationAttempt(
      {
        planId: 'plan-456',
        userId: 'user-789',
        input: mockInput,
      },
      {
        provider: mockProvider,
        dbClient: mockDb as any,
        signal: controller.signal,
      }
    );

    expect(result.status).toBe('failure');
  });

  it('records timeout flag in failure result', async () => {
    mockProvider.generate = vi
      .fn()
      .mockRejectedValue(new ProviderTimeoutError());

    const result = await runGenerationAttempt(
      {
        planId: 'plan-456',
        userId: 'user-789',
        input: mockInput,
      },
      {
        provider: mockProvider,
        dbClient: mockDb as any,
        timeoutConfig: { baseMs: 100 },
      }
    );

    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles custom clock for timing', async () => {
    let time = 1000;
    const mockClock = vi.fn(() => time);

    mockProvider.generate = vi.fn().mockImplementation(async () => {
      time += 5000; // Simulate 5 seconds
      return {
        stream: (async function* () {
          yield JSON.stringify({ modules: [] });
        })(),
        metadata: { provider: 'test', model: 'test-model', usage: {} },
      };
    });

    const result = await runGenerationAttempt(
      {
        planId: 'plan-456',
        userId: 'user-789',
        input: mockInput,
      },
      {
        provider: mockProvider,
        dbClient: mockDb as any,
        clock: mockClock,
      }
    );

    expect(result.durationMs).toBe(5000);
  });

  it('includes extended timeout flag when timeout was extended', async () => {
    // This tests the adaptive timeout behavior where first module detection extends timeout
    const validPlan = JSON.stringify({
      modules: [
        {
          title: 'Module 1',
          description: 'First module',
          estimated_minutes: 120,
          tasks: [
            {
              title: 'Task 1',
              description: 'First task',
              estimated_minutes: 30,
              resources: [
                {
                  title: 'Resource 1',
                  url: 'https://example.com',
                  type: 'article',
                },
              ],
            },
            {
              title: 'Task 2',
              description: 'Second task',
              estimated_minutes: 30,
              resources: [
                {
                  title: 'Resource 2',
                  url: 'https://example.com/2',
                  type: 'article',
                },
              ],
            },
            {
              title: 'Task 3',
              description: 'Third task',
              estimated_minutes: 30,
              resources: [
                {
                  title: 'Resource 3',
                  url: 'https://example.com/3',
                  type: 'article',
                },
              ],
            },
          ],
        },
      ],
    });

    mockProvider.generate = vi.fn().mockResolvedValue({
      stream: (async function* () {
        yield validPlan;
      })(),
      metadata: { provider: 'test', model: 'test-model', usage: {} },
    });

    const result = await runGenerationAttempt(
      {
        planId: 'plan-456',
        userId: 'user-789',
        input: mockInput,
      },
      {
        provider: mockProvider,
        dbClient: mockDb as any,
        timeoutConfig: { baseMs: 30000, extensionMs: 30000 },
      }
    );

    // extendedTimeout flag indicates whether timeout was adjusted during generation
    expect(result).toHaveProperty('extendedTimeout');
  });

  it('cleans up abort listeners on completion', async () => {
    const controller = new AbortController();
    const validPlan = JSON.stringify({
      modules: [
        {
          title: 'Module 1',
          estimated_minutes: 60,
          tasks: [
            {
              title: 'Task 1',
              estimated_minutes: 20,
              resources: [
                {
                  title: 'Resource 1',
                  url: 'https://example.com',
                  type: 'article',
                },
              ],
            },
            {
              title: 'Task 2',
              estimated_minutes: 20,
              resources: [
                {
                  title: 'Resource 2',
                  url: 'https://example.com/2',
                  type: 'article',
                },
              ],
            },
            {
              title: 'Task 3',
              estimated_minutes: 20,
              resources: [
                {
                  title: 'Resource 3',
                  url: 'https://example.com/3',
                  type: 'article',
                },
              ],
            },
          ],
        },
      ],
    });

    mockProvider.generate = vi.fn().mockResolvedValue({
      stream: (async function* () {
        yield validPlan;
      })(),
      metadata: { provider: 'test', model: 'test-model', usage: {} },
    });

    await runGenerationAttempt(
      {
        planId: 'plan-456',
        userId: 'user-789',
        input: mockInput,
      },
      {
        provider: mockProvider,
        dbClient: mockDb as any,
        signal: controller.signal,
      }
    );

    // Should complete without leaving dangling listeners
    expect(controller.signal.aborted).toBe(false);
  });
});