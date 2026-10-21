import type { DbClient } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

import { mapWithConcurrency } from '../../../../workers/jobs/src/workflows/module-lessons/grounded';
import {
  type ModuleLessonsWorkflowDeps,
  type ModuleLessonsWorkflowParams,
  runModuleLessonsWorkflow,
} from '../../../../workers/jobs/src/workflows/module-lessons/run';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries = vi.hoisted(() => ({
  load: vi.fn(),
  claim: vi.fn(),
  revert: vi.fn(),
  markProviderStarted: vi.fn(),
  commitSuccess: vi.fn(),
  commitFailure: vi.fn(),
}));

vi.mock('@/lib/db/queries/module-lesson-generation', () => ({
  loadModuleLessonGenerationContext: queries.load,
  claimModuleLessonGenerationOrDescribe: queries.claim,
  revertModuleLessonGeneratingToNotGenerated: queries.revert,
  markModuleLessonProviderStarted: queries.markProviderStarted,
  commitModuleLessonBatchSuccess: queries.commitSuccess,
  commitModuleLessonGenerationFailure: queries.commitFailure,
}));

vi.mock('@/features/plans/entitlement/access', () => ({
  readPlanContentAccess: vi.fn(async () => 'full'),
}));

const tier = vi.hoisted(() => ({
  value: 'free' as 'free' | 'starter' | 'pro',
}));

vi.mock('@/features/billing/tier', () => ({
  resolveUserTier: vi.fn(async () => tier.value),
}));

const research = vi.hoisted(() => ({ latest: vi.fn() }));

vi.mock('@/lib/db/queries/plan-research', () => ({
  getLatestPlanResearch: research.latest,
}));

const writer = vi.hoisted(() => ({ write: vi.fn() }));

vi.mock(
  '@/features/lesson-content/grounded-lesson-writer',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/lesson-content/grounded-lesson-writer')
    >()),
    writeGroundedLesson: writer.write,
  }),
);

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getUserPreferences: vi.fn(async () => ({
    preferredAiModel: null,
    preferredRegenerationAiModel: null,
    preferredLessonAiModel: null,
    analyticsTimezone: 'UTC',
  })),
}));

const PLAN_ID = '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f';
const MODULE_ID = '1c6f3d2e-7a5b-4f4c-8d9e-8b7c6d5e4f30';
const USER_ID = '2d7a4e3f-8b6c-4a5d-9e0f-9c8d7e6f5a41';
const TASK_A = '3e8b5f4a-9c7d-4b6e-8f1a-0d9e8f7a6b52';
const TASK_B = '4f9c6a5b-0d8e-4c7f-9a2b-1e0f9a8b7c63';
const BATCH_REQUEST_ID = 'batch_1';
const INSTANCE_ID = `lessons-${MODULE_ID}-${BATCH_REQUEST_ID}`;
const NOW = new Date('2026-10-07T12:00:00.000Z');

const params: ModuleLessonsWorkflowParams = {
  v: 1,
  planId: PLAN_ID,
  moduleId: MODULE_ID,
  userId: USER_ID,
  batchRequestId: BATCH_REQUEST_ID,
  correlationId: 'req-1',
};

type ModuleState = {
  status: 'not_generated' | 'generating' | 'ready' | 'failed';
  metadata: Record<string, unknown> | null;
};

/** The module row the mocked queries read and write. */
let moduleRow: ModuleState;

/** The module's tasks, in order. */
let taskIds: string[];

function validBatchText(taskIds: readonly string[] = [TASK_A, TASK_B]): string {
  const block = { type: 'heading', text: 'Hi' };
  return JSON.stringify({
    version: 1,
    tasks: taskIds.map((taskId) => ({
      taskId,
      content: { version: 1, blocks: [block] },
    })),
  });
}

function textStream(text: string): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

function providerReturning(text: string) {
  return {
    generateModuleLessonBatch: vi.fn(async () => ({
      stream: textStream(text),
      metadata: {
        provider: 'mock',
        model: 'mock-module-lesson-batch-v1',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
    })),
  };
}

/** Returns each response in turn, one per provider call. */
function providerReturningEach(
  ...responses: ReadonlyArray<{ text: string; finishReason?: string }>
) {
  const generateModuleLessonBatch = vi.fn();
  for (const { text, finishReason } of responses) {
    generateModuleLessonBatch.mockImplementationOnce(async () => ({
      stream: textStream(text),
      metadata: {
        provider: 'mock',
        model: 'mock-module-lesson-batch-v1',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        finishReason,
      },
    }));
  }
  return { generateModuleLessonBatch };
}

/** Runs each step like Workflows does: retries until the limit or a NonRetryableError. */
function createStep() {
  const calls: Array<{ name: string; attempts: number }> = [];
  const step = {
    async do(
      name: string,
      config: { retries: { limit: number } },
      callback: (ctx: { attempt: number }) => Promise<unknown>,
    ) {
      const call = { name, attempts: 0 };
      calls.push(call);
      for (let attempt = 1; ; attempt += 1) {
        call.attempts = attempt;
        try {
          return await callback({ attempt });
        } catch (error) {
          if (
            (error as Error).name === 'NonRetryableError' ||
            attempt > config.retries.limit
          ) {
            throw error;
          }
        }
      }
    },
  };
  return { step: step as unknown as Pick<WorkflowStep, 'do'>, calls };
}

function event(
  payload: unknown = params,
): WorkflowEvent<ModuleLessonsWorkflowParams> {
  return {
    payload: payload as ModuleLessonsWorkflowParams,
    timestamp: NOW,
    instanceId: INSTANCE_ID,
    workflowName: 'atlaris-module-lessons-staging',
  };
}

function makeDeps(overrides: Partial<ModuleLessonsWorkflowDeps> = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const deps: ModuleLessonsWorkflowDeps = {
    isEnabled: () => true,
    // Grounded generation off: today's pipeline.
    isGroundedEnabled: () => false,
    withDb: (fn) => fn({} as DbClient),
    logger,
    nonRetryable: (message) =>
      Object.assign(new Error(message), { name: 'NonRetryableError' }),
    provider: providerReturning(validBatchText()),
    now: () => NOW,
    ...overrides,
  };
  return { deps, logger };
}

function stepLogs(logger: { info: ReturnType<typeof vi.fn> }) {
  return logger.info.mock.calls
    .map(([fields]) => fields as Record<string, unknown>)
    .filter((fields) => fields.job === 'module-lessons');
}

describe('runModuleLessonsWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskIds = [TASK_A, TASK_B];
    tier.value = 'free';
    research.latest.mockResolvedValue(null);
    // The app's provisional claim: generating, batch ID, no workflow yet.
    moduleRow = {
      status: 'generating',
      metadata: { version: 1, batchRequestId: BATCH_REQUEST_ID },
    };

    queries.load.mockImplementation(async () => ({
      plan: {
        id: PLAN_ID,
        topic: 'TypeScript',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
      },
      module: {
        id: MODULE_ID,
        title: 'Basics',
        description: null,
        order: 1,
        lessonGenerationStatus: moduleRow.status,
        lessonGenerationMetadata: moduleRow.metadata,
      },
      tasks: taskIds.map((id, index) => ({
        id,
        moduleId: MODULE_ID,
        order: index + 1,
        title: `Task ${String(index + 1)}`,
        description: null,
        estimatedMinutes: 10,
        hasMicroExplanation: false,
        lessonContent: null,
      })),
      isUnlocked: true,
    }));
    queries.claim.mockImplementation(async (_db, _p, _m, _u, options) => {
      moduleRow.metadata = {
        version: 1,
        batchRequestId: options.batchRequestId,
        workflow: options.workflow,
      };
      return { kind: 'claimed', workflowStartedAt: options.workflow.startedAt };
    });
    queries.revert.mockImplementation(async () => {
      moduleRow.status = 'not_generated';
    });
    queries.markProviderStarted.mockImplementation(
      async (_db, { providerStartedAt }) => {
        moduleRow.metadata = { ...moduleRow.metadata, providerStartedAt };
      },
    );
    queries.commitSuccess.mockImplementation(async (_db, { metadata }) => {
      moduleRow = { status: 'ready', metadata };
    });
    queries.commitFailure.mockImplementation(async () => {
      moduleRow.status = 'failed';
    });
  });

  it("adopts the app's provisional claim, generates, and commits", async () => {
    const { deps, logger } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'success' });

    expect(calls.map((call) => call.name)).toEqual([
      'claim',
      'generate',
      'parse-commit',
    ]);
    expect(queries.claim).toHaveBeenCalledWith(
      expect.anything(),
      PLAN_ID,
      MODULE_ID,
      USER_ID,
      {
        batchRequestId: BATCH_REQUEST_ID,
        workflow: {
          provider: 'cloudflare-workflow',
          runId: INSTANCE_ID,
          startedAt: NOW.toISOString(),
        },
      },
    );
    expect(queries.markProviderStarted).toHaveBeenCalledOnce();
    expect(queries.commitSuccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        moduleId: MODULE_ID,
        metadata: {
          version: 1,
          batchRequestId: BATCH_REQUEST_ID,
          workflow: {
            provider: 'cloudflare-workflow',
            runId: INSTANCE_ID,
            startedAt: NOW.toISOString(),
            completedAt: NOW.toISOString(),
          },
        },
      }),
    );
    expect(moduleRow.status).toBe('ready');

    const logs = stepLogs(logger);
    expect(logs.map((fields) => [fields.step, fields.outcome])).toEqual([
      ['claim', 'claimed'],
      ['generate', 'generated'],
      ['parse-commit', 'success'],
    ]);
    expect(logs[1]).toMatchObject({
      instanceId: INSTANCE_ID,
      planId: PLAN_ID,
      moduleId: MODULE_ID,
      taskCount: 2,
      rawChars: validBatchText().length,
    });
  });

  it('reverts the claim and stops when the switch is off', async () => {
    const provider = providerReturning(validBatchText());
    const { deps } = makeDeps({ isEnabled: () => false, provider });
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'disabled' });

    expect(queries.revert).toHaveBeenCalledWith(expect.anything(), {
      userId: USER_ID,
      planId: PLAN_ID,
      moduleId: MODULE_ID,
      workflowRunId: INSTANCE_ID,
      batchRequestId: BATCH_REQUEST_ID,
    });
    expect(queries.claim).not.toHaveBeenCalled();
    expect(provider.generateModuleLessonBatch).not.toHaveBeenCalled();
    expect(calls.map((call) => call.name)).toEqual(['claim']);
  });

  it('reverts the claim when the switch drops before the provider call', async () => {
    const enabled = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    const provider = providerReturning(validBatchText());
    const { deps } = makeDeps({ isEnabled: enabled, provider });
    const { step } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'disabled' });

    expect(queries.claim).toHaveBeenCalledOnce();
    expect(queries.revert).toHaveBeenCalledOnce();
    expect(queries.markProviderStarted).not.toHaveBeenCalled();
    expect(provider.generateModuleLessonBatch).not.toHaveBeenCalled();
    expect(moduleRow.status).toBe('not_generated');
  });

  it('does not retry a provider failure and records the module failed', async () => {
    const provider = {
      generateModuleLessonBatch: vi.fn(async () => {
        throw new Error('provider timeout');
      }),
    };
    const { deps } = makeDeps({ provider });
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'failed' });

    expect(calls).toEqual([
      { name: 'claim', attempts: 1 },
      { name: 'generate', attempts: 1 },
      { name: 'fail', attempts: 1 },
    ]);
    expect(provider.generateModuleLessonBatch).toHaveBeenCalledOnce();
    expect(queries.commitFailure).toHaveBeenCalledOnce();
    expect(queries.revert).not.toHaveBeenCalled();
    expect(moduleRow.status).toBe('failed');
  });

  it('retries once when the first output has the wrong task count, then commits', async () => {
    const provider = providerReturningEach(
      { text: validBatchText([TASK_A]), finishReason: 'stop' },
      { text: validBatchText(), finishReason: 'stop' },
    );
    const { deps, logger } = makeDeps({ provider });
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'success' });

    expect(calls).toEqual([
      { name: 'claim', attempts: 1 },
      { name: 'generate', attempts: 1 },
      { name: 'parse-commit', attempts: 1 },
      { name: 'generate-retry', attempts: 1 },
      { name: 'parse-commit-retry', attempts: 1 },
    ]);
    expect(provider.generateModuleLessonBatch).toHaveBeenCalledTimes(2);
    expect(queries.commitSuccess).toHaveBeenCalledOnce();
    expect(queries.commitFailure).not.toHaveBeenCalled();
    expect(moduleRow.status).toBe('ready');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'parse-commit',
        attempt: 1,
        outcome: 'parse_failed',
        errorKind: 'validation',
        errorMessage:
          'Module lesson batch must include exactly 2 tasks; got 1.',
      }),
      'Module lessons workflow step finished',
    );
    expect(
      stepLogs(logger).map((fields) => [
        fields.step,
        fields.attempt,
        fields.outcome,
      ]),
    ).toEqual([
      ['claim', undefined, 'claimed'],
      ['generate', 1, 'generated'],
      ['generate-retry', 2, 'generated'],
      ['parse-commit-retry', 2, 'success'],
    ]);
  });

  it('retries once after invalid JSON and logs the finish reason', async () => {
    const provider = providerReturningEach(
      { text: '{"version":1,"tasks":[', finishReason: 'length' },
      { text: validBatchText(), finishReason: 'stop' },
    );
    const { deps, logger } = makeDeps({ provider });
    const { step } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'success' });

    expect(provider.generateModuleLessonBatch).toHaveBeenCalledTimes(2);
    expect(queries.commitSuccess).toHaveBeenCalledOnce();
    const generateLogs = stepLogs(logger).filter(
      (fields) => fields.outcome === 'generated',
    );
    expect(
      generateLogs.map((fields) => [fields.step, fields.finishReason]),
    ).toEqual([
      ['generate', 'length'],
      ['generate-retry', 'stop'],
    ]);
  });

  it('records the module failed when the retry also fails to parse', async () => {
    const provider = providerReturningEach(
      { text: 'not json' },
      { text: 'not json' },
    );
    const { deps, logger } = makeDeps({ provider });
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'failed' });

    expect(calls).toEqual([
      { name: 'claim', attempts: 1 },
      { name: 'generate', attempts: 1 },
      { name: 'parse-commit', attempts: 1 },
      { name: 'generate-retry', attempts: 1 },
      { name: 'parse-commit-retry', attempts: 1 },
      { name: 'fail', attempts: 1 },
    ]);
    expect(provider.generateModuleLessonBatch).toHaveBeenCalledTimes(2);
    expect(queries.commitSuccess).not.toHaveBeenCalled();
    expect(queries.commitFailure).toHaveBeenCalledOnce();
    expect(moduleRow.status).toBe('failed');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'parse-commit-retry',
        attempt: 2,
        outcome: 'parse_failed',
        errorKind: 'invalid_json',
        errorMessage: 'Module lesson batch response was not valid JSON.',
      }),
      'Module lessons workflow step finished',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'parse-commit-retry' }),
      'Module lessons workflow step failed',
    );
  });

  it('reverts without a retry call when the switch drops after a parse failure', async () => {
    let enabled = true;
    const provider = {
      generateModuleLessonBatch: vi.fn(async () => {
        enabled = false;
        return {
          stream: textStream('not json'),
          metadata: { provider: 'mock', model: 'mock-module-lesson-batch-v1' },
        };
      }),
    };
    const { deps } = makeDeps({ provider, isEnabled: () => enabled });
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'disabled' });

    expect(calls.map((call) => call.name)).toEqual([
      'claim',
      'generate',
      'parse-commit',
      'generate-retry',
    ]);
    expect(provider.generateModuleLessonBatch).toHaveBeenCalledOnce();
    expect(queries.revert).toHaveBeenCalledOnce();
    expect(queries.commitFailure).not.toHaveBeenCalled();
    expect(moduleRow.status).toBe('not_generated');
  });

  it('does not commit twice when a retry finds its own commit already landed', async () => {
    queries.commitSuccess.mockImplementationOnce(async (_db, { metadata }) => {
      moduleRow = { status: 'ready', metadata };
      throw new Error('connection reset');
    });
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'success' });

    expect(calls.at(-1)).toEqual({ name: 'parse-commit', attempts: 2 });
    expect(queries.commitSuccess).toHaveBeenCalledOnce();
    expect(queries.commitFailure).not.toHaveBeenCalled();
  });

  it('reverts when the claim step exhausts its retries', async () => {
    queries.claim.mockRejectedValue(new Error('db down'));
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'failed' });

    expect(calls).toEqual([
      { name: 'claim', attempts: 4 },
      { name: 'fail', attempts: 1 },
    ]);
    expect(queries.revert).toHaveBeenCalledOnce();
    expect(queries.commitFailure).not.toHaveBeenCalled();
  });

  it('leaves a module it does not own alone on failure', async () => {
    const provider = {
      generateModuleLessonBatch: vi.fn(async () => {
        // Another run took the module over meanwhile.
        moduleRow.metadata = {
          version: 1,
          workflow: { provider: 'workflow-sdk', runId: 'wrun_other' },
        };
        throw new Error('provider timeout');
      }),
    };
    const { deps } = makeDeps({ provider });
    const { step } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'failed' });

    expect(queries.commitFailure).not.toHaveBeenCalled();
    expect(queries.revert).not.toHaveBeenCalled();
  });

  it('rejects invalid params without retrying', async () => {
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event({ v: 1 }), step, deps),
    ).rejects.toMatchObject({ name: 'NonRetryableError' });
    expect(calls).toEqual([]);
  });

  describe('grounded lessons', () => {
    const TASK_IDS = Array.from(
      { length: 7 },
      (_v, index) => `${String(index + 5)}a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`,
    );

    function usage(): CanonicalAIUsage {
      return {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        model: 'grounded-writer',
        provider: 'openrouter',
        estimatedCostCents: 1,
        providerCostMicrousd: 100,
        isPartial: false,
        missingFields: [],
      };
    }

    /** The taskId the lesson task part names. */
    function promptTaskId(call: { userParts: readonly { text: string }[] }) {
      return /taskId: (\S+)/.exec(call.userParts.at(-1)?.text ?? '')?.[1];
    }

    /** Writes each lesson with `text(taskId, attempt)` as its only paragraph. */
    function writerReturning(
      text: (taskId: string, attempt: number) => string = () => 'Typed [S1].',
    ) {
      const attempts = new Map<string, number>();
      writer.write.mockImplementation(async (call) => {
        const taskId = promptTaskId(call) ?? '';
        const attempt = (attempts.get(taskId) ?? 0) + 1;
        attempts.set(taskId, attempt);
        return {
          rawText: JSON.stringify({
            version: 1,
            tasks: [
              {
                taskId,
                content: {
                  version: 1,
                  blocks: [{ type: 'paragraph', text: text(taskId, attempt) }],
                },
              },
            ],
          }),
          usage: usage(),
          finishReason: 'stop',
        };
      });
    }

    const RESEARCH_ROW = {
      research: {
        id: 'research-1',
        planId: PLAN_ID,
        brief: 'Types help [S1].',
        mode: 'fast',
        status: 'ok',
        searchCount: 1,
        costMicrousd: null,
        createdAt: NOW,
      },
      sources: [
        {
          id: 'source-1',
          researchId: 'research-1',
          citationKey: 'S1',
          url: 'https://www.typescriptlang.org/docs/',
          title: 'TypeScript docs',
          publisher: 'typescriptlang.org',
          retrievedAt: NOW,
        },
      ],
    };

    function groundedDeps(overrides: Partial<ModuleLessonsWorkflowDeps> = {}) {
      return makeDeps({ isGroundedEnabled: () => true, ...overrides });
    }

    beforeEach(() => {
      research.latest.mockResolvedValue(RESEARCH_ROW);
      writerReturning();
    });

    it('leaves the batch flow unchanged when the grounded switch is off', async () => {
      const { deps } = makeDeps();
      const { step, calls } = createStep();

      await expect(
        runModuleLessonsWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => call.name)).toEqual([
        'claim',
        'generate',
        'parse-commit',
      ]);
      expect(research.latest).not.toHaveBeenCalled();
      expect(writer.write).not.toHaveBeenCalled();
      const [, committed] = queries.commitSuccess.mock.calls[0] ?? [];
      expect(committed.parsed.tasks[0].content).not.toHaveProperty('sourceIds');
    });

    it('writes one lesson per step with a shared cached prefix, then commits once', async () => {
      const { deps, logger } = groundedDeps();
      const { step, calls } = createStep();

      await expect(
        runModuleLessonsWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => call.name)).toEqual([
        'claim',
        'lesson-1',
        'lesson-2',
        'parse-commit',
      ]);
      expect(writer.write).toHaveBeenCalledTimes(2);
      const prompts = writer.write.mock.calls.map(([call]) => call);
      for (const call of prompts) {
        expect(call).toMatchObject({ tier: 'free', planId: PLAN_ID });
        expect(call.models.length).toBeGreaterThan(0);
      }
      const prefix = (call: (typeof prompts)[number]) =>
        call.userParts
          .filter((part: { cache?: boolean }) => part.cache)
          .map((part: { text: string }) => part.text);
      expect(prefix(prompts[0])).toHaveLength(2);
      expect(prefix(prompts[1])).toEqual(prefix(prompts[0]));
      expect(prompts.map(promptTaskId).sort()).toEqual([TASK_A, TASK_B].sort());

      expect(queries.markProviderStarted).toHaveBeenCalledTimes(2);
      expect(queries.commitSuccess).toHaveBeenCalledOnce();
      const [, committed] = queries.commitSuccess.mock.calls[0] ?? [];
      expect(
        committed.parsed.tasks.map(
          (task: { taskId: string; content: { sourceIds?: string[] } }) => [
            task.taskId,
            task.content.sourceIds,
          ],
        ),
      ).toEqual([
        [TASK_A, ['S1']],
        [TASK_B, ['S1']],
      ]);
      expect(committed.usage).toMatchObject({
        inputTokens: 20,
        totalTokens: 30,
        providerCostMicrousd: 200,
      });
      expect(moduleRow.status).toBe('ready');
      expect(
        stepLogs(logger).find((fields) => fields.step === 'claim')?.outcome,
      ).toBe('claimed_grounded');
    });

    it('retries only the lesson whose citations fail, then commits', async () => {
      writerReturning((taskId, attempt) =>
        taskId === TASK_A && attempt === 1 ? 'Made up [S9].' : 'Typed [S1].',
      );
      const { deps } = groundedDeps();
      const { step, calls } = createStep();

      await expect(
        runModuleLessonsWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => call.name).sort()).toEqual(
        [
          'claim',
          'lesson-1',
          'lesson-1-retry',
          'lesson-2',
          'parse-commit',
        ].sort(),
      );
      expect(writer.write).toHaveBeenCalledTimes(3);
      expect(calls.every((call) => call.attempts === 1)).toBe(true);
    });

    it('records the module failed when a lesson still fails after its retry', async () => {
      writerReturning((taskId) =>
        taskId === TASK_A ? 'See https://example.com' : 'Typed [S1].',
      );
      const { deps } = groundedDeps();
      const { step, calls } = createStep();

      await expect(
        runModuleLessonsWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'failed' });

      const names = calls.map((call) => call.name);
      expect(names).toContain('lesson-1-retry');
      expect(names.at(-1)).toBe('fail');
      expect(names).not.toContain('parse-commit');
      expect(queries.commitSuccess).not.toHaveBeenCalled();
      expect(moduleRow.status).toBe('failed');
    });

    it('forbids citations and drops the brief when the plan has no research', async () => {
      research.latest.mockResolvedValue({
        ...RESEARCH_ROW,
        research: { ...RESEARCH_ROW.research, status: 'failed_skipped' },
      });
      writerReturning((_taskId, attempt) =>
        attempt === 1 ? 'Typed [S1].' : 'Typed, no sources.',
      );
      const { deps } = groundedDeps();
      const { step, calls } = createStep();

      await expect(
        runModuleLessonsWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => call.name)).toContain('lesson-1-retry');
      const [first] = writer.write.mock.calls[0] ?? [];
      expect(
        first.userParts.some((part: { text: string }) =>
          part.text.includes('RESEARCH BRIEF'),
        ),
      ).toBe(false);
      const [, committed] = queries.commitSuccess.mock.calls[0] ?? [];
      expect(
        committed.parsed.tasks.map(
          (task: { content: { sourceIds?: string[] } }) =>
            task.content.sourceIds,
        ),
      ).toEqual([[], []]);
    });

    it.each([
      ['free', 2],
      ['pro', 6],
    ] as const)(
      'keeps at most the %s fan-out (%i) lesson calls in flight',
      async (userTier, limit) => {
        tier.value = userTier;
        taskIds = TASK_IDS;
        let inFlight = 0;
        let maxInFlight = 0;
        writer.write.mockImplementation(async (call) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return {
            rawText: JSON.stringify({
              version: 1,
              tasks: [
                {
                  taskId: promptTaskId(call),
                  content: {
                    version: 1,
                    blocks: [{ type: 'heading', text: 'Hi' }],
                  },
                },
              ],
            }),
            usage: usage(),
          };
        });
        const { deps } = groundedDeps();
        const { step } = createStep();

        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });

        expect(writer.write).toHaveBeenCalledTimes(TASK_IDS.length);
        expect(maxInFlight).toBe(limit);
      },
    );

    it('reverts the claim when the switch drops before a lesson call', async () => {
      const enabled = vi
        .fn<() => boolean>()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValue(false);
      const { deps } = groundedDeps({ isEnabled: enabled });
      const { step } = createStep();

      await expect(
        runModuleLessonsWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'disabled' });

      expect(writer.write).not.toHaveBeenCalled();
      expect(queries.revert).toHaveBeenCalled();
      expect(queries.commitSuccess).not.toHaveBeenCalled();
    });
  });
});

describe('mapWithConcurrency', () => {
  it('starts nothing new after a failure and waits for calls in flight', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const run = mapWithConcurrency([0, 1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      if (item === 0) {
        throw new Error('boom');
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished.push(item);
      return item;
    });

    await expect(run).rejects.toThrow('boom');
    expect(started).toEqual([0, 1]);
    expect(finished).toEqual([1]);
  });

  it('returns results in input order', async () => {
    await expect(
      mapWithConcurrency([30, 10, 20], 3, async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return ms;
      }),
    ).resolves.toEqual([30, 10, 20]);
  });
});
