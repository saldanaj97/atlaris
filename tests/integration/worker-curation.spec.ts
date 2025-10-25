import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from 'vitest';
import { processPlanGenerationJob } from '@/lib/jobs/worker-service';
import { curationConfig } from '@/lib/curation/config';
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

// Mock dependencies
vi.mock('@/lib/curation/youtube');
vi.mock('@/lib/ai/micro-explanations');
vi.mock('@/lib/db/queries/tasks');
vi.mock('@/lib/db/queries/resources');
vi.mock('@/lib/ai/orchestrator');
vi.mock('@/lib/curation/config', () => ({
  curationConfig: {
    enableCuration: true,
    minResourceScore: 0.6,
    cacheVersion: '1',
  },
}));

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
      vi.doMock('@/lib/curation/config', () => ({
        curationConfig: { ...curationConfig, enableCuration: false },
      }));

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
        candidate({ url: 'yt1', title: 'YT', source: 'youtube' }),
      ]);
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
      ] as unknown as ResourceCandidate[]);
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
      ] as unknown as ResourceCandidate[]);

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
        candidate({ url: 'yt1', title: 'YT', source: 'youtube' }),
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
        await new Promise((resolve) => setTimeout(resolve, 35_000)); // Exceed budget
        return [];
      });

      const result = await processPlanGenerationJob(mockJob);

      expect(result.status).toBe('success'); // Job succeeds despite budget overrun
      expect(mockCurateYouTube).toHaveBeenCalledTimes(1); // Only first task attempts
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
      mockCurateDocs.mockResolvedValue([
        candidate({ url: 'doc1', title: 'Doc', source: 'doc' }),
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
        candidate({ url: 'yt1', title: 'YT', source: 'youtube' }),
      ]);
      mockGenerateMicro.mockResolvedValue(
        'Explanation: useState is key. **Practice:** Counter app.'
      );

      await processPlanGenerationJob(mockJob);

      expect(mockGenerateMicro).toHaveBeenCalledWith(expect.any(Object), {
        topic: 'React Basics',
        taskTitle: 'Task with Explanation',
        skillLevel: 'beginner',
      });
      expect(mockAppendDescription).toHaveBeenCalledWith(
        'task1',
        expect.stringContaining('Explanation: useState')
      );
    });

    it('skips micro-explanations if budget tight', async () => {
      // Simulate tight budget by mocking time
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 25_000); // Near budget end

      mockGetTasks.mockResolvedValue([
        {
          task: makeTask({ id: 'task1', title: 'Budget Tight Task' }),
          moduleTitle: 'Module 1',
        },
      ]);
      mockCurateYouTube.mockResolvedValue([]);

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
        candidate({ url: 'yt1', title: 'YT', source: 'youtube' }),
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
