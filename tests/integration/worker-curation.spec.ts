import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from 'vitest';

// Mock dependencies BEFORE imports to prevent real module evaluation
// Create a mutable config object that can be updated per test
// Use vi.hoisted to ensure the mock is initialized before vi.mock factory executes
const { mockCurationConfig } = vi.hoisted(() => ({
  mockCurationConfig: {
    enableCuration: true,
    minResourceScore: 0.6,
    youtubeApiKey: undefined,
    cseId: undefined,
    cseKey: undefined,
    concurrency: 3,
    timeBudgetMs: 30_000,
    maxResults: 3,
  },
}));

vi.mock('@/lib/curation/config', () => ({
  curationConfig: mockCurationConfig,
}));
vi.mock('@/lib/curation/youtube', () => ({
  curateYouTube: vi.fn(),
}));
vi.mock('@/lib/curation/docs', () => ({
  curateDocs: vi.fn(),
}));
vi.mock('@/lib/ai/micro-explanations', () => ({
  generateMicroExplanation: vi.fn(),
}));
vi.mock('@/lib/db/queries/tasks', () => ({
  getTasksByPlanId: vi.fn(),
  appendTaskDescription: vi.fn(),
}));
vi.mock('@/lib/db/queries/resources', () => ({
  upsertAndAttach: vi.fn(),
}));
vi.mock('@/lib/ai/orchestrator', () => ({
  runGenerationAttempt: vi.fn(),
}));
// Avoid DB interaction in usage/stripe for these curation-focused tests
vi.mock('@/lib/db/usage', () => ({
  recordUsage: vi.fn(async () => {}),
}));
vi.mock('@/lib/stripe/usage', () => ({
  markPlanGenerationSuccess: vi.fn(async () => {}),
  markPlanGenerationFailure: vi.fn(async () => {}),
}));

import { processPlanGenerationJob } from '@/lib/jobs/worker-service';
import { curateDocs } from '@/lib/curation/docs';
import { curateYouTube } from '@/lib/curation/youtube';
import { generateMicroExplanation } from '@/lib/ai/micro-explanations';
import type { InferSelectModel } from 'drizzle-orm';
import { tasks as tasksTable } from '@/lib/db/schema';
import type { ResourceCandidate } from '@/lib/curation/types';
import type { Scored } from '@/lib/curation/ranking';
import {
  getTasksByPlanId,
  appendTaskDescription,
} from '@/lib/db/queries/tasks';
import { upsertAndAttach } from '@/lib/db/queries/resources';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import type { Job, PlanGenerationJobData } from '@/lib/jobs/types';
import { JOB_TYPES } from '@/lib/jobs/types';

describe('Worker curation integration', () => {
  let mockJob: Job;
  let mockPayload: PlanGenerationJobData;
  let mockRunGeneration: MockedFunction<typeof runGenerationAttempt>;
  let mockCurateYouTube: MockedFunction<typeof curateYouTube>;
  let mockCurateDocs: MockedFunction<typeof curateDocs>;
  let mockGenerateMicro: MockedFunction<typeof generateMicroExplanation>;
  let mockGetTasks: MockedFunction<typeof getTasksByPlanId>;
  let mockAppendDescription: MockedFunction<typeof appendTaskDescription>;
  let mockUpsertAttach: MockedFunction<typeof upsertAndAttach>;

  beforeEach(() => {
    // Ensure curation starts enabled by default for these tests
    // Individual tests can toggle this flag as needed
    mockCurationConfig.enableCuration = true;

    mockJob = {
      id: 'job1',
      type: JOB_TYPES.PLAN_GENERATION,
      planId: 'plan1',
      userId: 'user1',
      data: {},
      attempts: 1,
      maxAttempts: 3,
    } as Job;

    mockPayload = {
      topic: 'React Basics',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      notes: null,
      startDate: null,
      deadlineDate: null,
    };

    mockJob.data = mockPayload;

    mockRunGeneration = vi.mocked(runGenerationAttempt);
    mockCurateYouTube = vi.mocked(curateYouTube);
    mockCurateDocs = vi.mocked(curateDocs);
    mockGenerateMicro = vi.mocked(generateMicroExplanation);
    mockGetTasks = vi.mocked(getTasksByPlanId);
    mockAppendDescription = vi.mocked(appendTaskDescription);
    mockUpsertAttach = vi.mocked(upsertAndAttach);

    // Mock micro-explanations generation
    mockGenerateMicro.mockResolvedValue('Mock micro-explanation');

    // Mock successful plan generation
    mockRunGeneration.mockResolvedValue({
      status: 'success',
      modules: [
        { title: 'Module 1', tasks: [{ title: 'Task 1', id: 'task1' }] },
      ],
      durationMs: 1000,
      metadata: {},
      attempt: { id: 'attempt1' },
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset curation config mock
    vi.restoreAllMocks();
  });

  // Helpers to satisfy strict types
  type DbTask = InferSelectModel<typeof tasksTable>;
  function makeTask(
    overrides: Partial<DbTask> & { id: string; title: string }
  ): DbTask {
    return {
      id: overrides.id,
      moduleId: overrides.moduleId ?? 'module1',
      order: overrides.order ?? 1,
      title: overrides.title,
      description: overrides.description ?? null,
      estimatedMinutes: overrides.estimatedMinutes ?? 30,
      createdAt: overrides.createdAt ?? new Date(),
      updatedAt: overrides.updatedAt ?? new Date(),
    } as DbTask;
  }

  function candidate(opts: {
    url: string;
    title: string;
    source: 'youtube' | 'doc';
    score?: number;
    metadata?: Record<string, unknown>;
  }): ResourceCandidate {
    return {
      url: opts.url,
      title: opts.title,
      source: opts.source,
      score: {
        blended: opts.score ?? 0.7,
        components: {},
        scoredAt: new Date().toISOString(),
      },
      metadata: {
        query: 'React Basics',
        ...(opts.metadata ?? {}),
      },
    };
  }

  function scoredCandidate(opts: {
    url: string;
    title: string;
    source: 'youtube' | 'doc';
    numericScore: number;
    metadata?: Record<string, unknown>;
  }): Scored {
    const base = candidate({
      url: opts.url,
      title: opts.title,
      source: opts.source,
      score: opts.numericScore,
      metadata: opts.metadata,
    });
    return {
      ...base,
      numericScore: opts.numericScore,
      // Minimal components for type satisfaction; values are not asserted in tests
      components: {
        popularity: opts.numericScore,
        recency: 0.5,
        relevance: 0.5,
      },
    };
  }

  describe('Curation gating', () => {
    it('skips curation when ENABLE_CURATION=false', async () => {
      // Override the curation config to disable curation for this test
      mockCurationConfig.enableCuration = false;

      // Mock getTasks to return empty array (shouldn't be called but just in case)
      mockGetTasks.mockResolvedValue([]);

      const result = await processPlanGenerationJob(mockJob);
      expect(result.status).toBe('success');
      expect(mockCurateYouTube).not.toHaveBeenCalled();
      expect(mockCurateDocs).not.toHaveBeenCalled();
    });

    it('runs curation when ENABLE_CURATION=true', async () => {
      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'Test Task' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockResolvedValue([
        scoredCandidate({
          url: 'yt1',
          title: 'YT',
          source: 'youtube',
          numericScore: 0.8,
        }),
      ]);
      mockCurateDocs.mockResolvedValue([]);
      mockUpsertAttach.mockResolvedValue([]);

      const result = await processPlanGenerationJob(mockJob);
      expect(result.status).toBe('success');
      expect(mockGetTasks).toHaveBeenCalledWith('plan1');
      expect(mockCurateYouTube).toHaveBeenCalled();
      expect(mockUpsertAttach).toHaveBeenCalled();
    });
  });

  describe('Source blending and early-stop', () => {
    it('calls docs only if YouTube returns <3 results', async () => {
      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'Task with YT only' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockResolvedValue([
        scoredCandidate({
          url: 'yt1',
          title: 'YT1',
          source: 'youtube',
          numericScore: 0.8,
        }),
        scoredCandidate({
          url: 'yt2',
          title: 'YT2',
          source: 'youtube',
          numericScore: 0.7,
        }),
      ]);
      mockCurateDocs.mockResolvedValue([]);

      await processPlanGenerationJob(mockJob);

      expect(mockCurateDocs).toHaveBeenCalled(); // Since <3 from YT
    });

    it('skips docs if YouTube returns 3+ high-scoring results (early-stop)', async () => {
      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'Task with YT only' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockResolvedValue([
        scoredCandidate({
          url: 'yt1',
          title: 'YT1',
          source: 'youtube',
          numericScore: 0.8,
        }),
        scoredCandidate({
          url: 'yt2',
          title: 'YT2',
          source: 'youtube',
          numericScore: 0.7,
        }),
        scoredCandidate({
          url: 'yt3',
          title: 'YT3',
          source: 'youtube',
          numericScore: 0.65,
        }),
      ]);

      await processPlanGenerationJob(mockJob);

      expect(mockCurateDocs).not.toHaveBeenCalled(); // Early-stop
    });
  });

  describe('Idempotency', () => {
    it('does not duplicate resources on re-run', async () => {
      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'Idempotent Task' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockResolvedValue([
        scoredCandidate({
          url: 'yt1',
          title: 'YT',
          source: 'youtube',
          numericScore: 0.75,
        }),
      ]);
      mockUpsertAttach.mockResolvedValue([]);

      // First run
      await processPlanGenerationJob(mockJob);

      // Second run (same job)
      await processPlanGenerationJob(mockJob);

      expect(mockUpsertAttach).toHaveBeenCalledTimes(2); // Called twice, but onConflictDoNothing prevents dups
    });
  });

  describe('Time budget and concurrency', () => {
    it('skips tasks when time budget exceeded', async () => {
      vi.useFakeTimers();
      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'First Task' }),
          moduleTitle: 'Module 1',
        },
        {
          task: makeTask({ id: 'task2', title: 'Second Task' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockImplementation(async () => {
        // Simulate long-running task
        vi.advanceTimersByTime(35_000);
        return [];
      });

      const result = await processPlanGenerationJob(mockJob);

      expect(result.status).toBe('success'); // Job succeeds despite budget overrun
      expect(mockCurateYouTube).toHaveBeenCalledTimes(1); // Only first task attempts

      vi.useRealTimers();
    });
  });

  describe('Error tolerance', () => {
    it('continues on adapter failure', async () => {
      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'YT Fail' }),
          moduleTitle: 'Module 1',
        },
        {
          task: makeTask({ id: 'task2', title: 'Docs Success' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockRejectedValue(new Error('YT API fail'));
      // First task yields no docs; second task yields one doc
      mockCurateDocs.mockResolvedValueOnce([]);
      mockCurateDocs.mockResolvedValueOnce([
        scoredCandidate({
          url: 'doc1',
          title: 'Doc',
          source: 'doc',
          numericScore: 0.85,
        }),
      ]);

      await processPlanGenerationJob(mockJob);

      expect(mockCurateYouTube).toHaveBeenCalled();
      expect(mockCurateDocs).toHaveBeenCalled(); // Second task still processes
      expect(mockUpsertAttach).toHaveBeenCalledTimes(1); // Only successful attachment
    });
  });

  describe('Micro-explanations integration', () => {
    it('appends micro-explanations to task descriptions after resources', async () => {
      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'Task with Explanation' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockResolvedValue([
        scoredCandidate({
          url: 'yt1',
          title: 'YT',
          source: 'youtube',
          numericScore: 0.8,
        }),
      ]);
      mockGenerateMicro.mockResolvedValue(
        'Explanation: useState is key. **Practice:** Counter app.'
      );

      await processPlanGenerationJob(mockJob);

      expect(mockGenerateMicro).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          topic: 'React Basics',
          taskTitle: 'Task with Explanation',
          skillLevel: 'beginner',
        })
      );
      expect(mockAppendDescription).toHaveBeenCalledWith(
        'task1',
        expect.stringContaining('Explanation: useState')
      );
    });

    it('skips micro-explanations if budget tight', async () => {
      // Simulate tight budget by mocking time
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 31_000); // Exceed 30s budget to skip micro-explanations

      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'Budget Tight Task' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockImplementation(async () => {
        // Simulate heavy time spent on curation so budget is exceeded
        vi.advanceTimersByTime(31_000);
        return [];
      });

      await processPlanGenerationJob(mockJob);

      expect(mockGenerateMicro).not.toHaveBeenCalled(); // Skipped due to budget

      vi.useRealTimers();
    });
  });

  describe('Observability', () => {
    it('logs curation metrics', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'Logged Task' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockResolvedValue([
        scoredCandidate({
          url: 'yt1',
          title: 'YT',
          source: 'youtube',
          numericScore: 0.8,
        }),
      ]);
      mockUpsertAttach.mockResolvedValue([]);

      await processPlanGenerationJob(mockJob);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Curation] Starting curation')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Attached 1 resources')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Completed in')
      );

      consoleSpy.mockRestore();
    });
  });
});
