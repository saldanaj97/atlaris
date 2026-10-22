import type { DbClient } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

import { mapWithConcurrency } from '../../../../workers/jobs/src/workflows/module-lessons/grounded';
import {
  type ModuleLessonsWorkflowDeps,
  type ModuleLessonsWorkflowParams,
  runModuleLessonsWorkflow,
} from '../../../../workers/jobs/src/workflows/module-lessons/run';
import {
  catalogReadsRequireDb,
  PRICED_PROBE,
  probeCatalog,
} from '../../../helpers/catalog-db-scope';
import { REGENERATION_REASON_GUIDANCE } from '@/features/plans/regeneration-orchestration/reasons';
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

const plan = vi.hoisted(() => ({
  feedback: {
    regenerationReasons: null as string[] | null,
    regenerationNote: null as string | null,
  },
}));

vi.mock('@/lib/db/queries/helpers/plans-helpers', () => ({
  selectOwnedPlanById: vi.fn(async () => plan.feedback),
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

const quality = vi.hoisted(() => ({
  call: vi.fn(),
  insert: vi.fn(),
  list: vi.fn(),
}));

vi.mock(
  '@/features/lesson-content/lesson-quality-call',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/lesson-content/lesson-quality-call')
    >()),
    sendLessonQualityCall: quality.call,
  }),
);

vi.mock('@/lib/db/queries/generation-quality-issues', () => ({
  insertGenerationQualityIssues: quality.insert,
  listGenerationQualityIssuesForPlan: quality.list,
}));

const budget = vi.hoisted(() => ({
  spent: vi.fn(async () => 0),
  insert: vi.fn(async (_cuts: unknown[]) => []),
  count: vi.fn(async () => 0),
}));

vi.mock('@/lib/db/queries/plan-ai-budget', () => ({
  sumPlanAiSpendMicrousd: budget.spent,
  insertGenerationBudgetCuts: budget.insert,
  countGenerationBudgetCutsForModule: budget.count,
}));

const groundedPicks = vi.hoisted(() => ({
  writer: null as string | null,
  /** The legacy "Preferred lesson model"; grounded lessons must ignore it. */
  legacyLesson: null as string | null,
  verifier: null as string | null,
  advisor: null as string | null,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getUserPreferences: vi.fn(async () => ({
    preferredAiModel: null,
    preferredRegenerationAiModel: null,
    preferredLessonAiModel: groundedPicks.legacyLesson,
    analyticsTimezone: 'UTC',
  })),
  getGroundedModelPreferences: vi.fn(async () => ({
    preferredWriterAiModel: groundedPicks.writer,
    preferredVerifierAiModel: groundedPicks.verifier,
    preferredAdvisorAiModel: groundedPicks.advisor,
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
    withDb: (fn) =>
      fn({
        transaction: async (run: (tx: DbClient) => Promise<unknown>) =>
          run({} as DbClient),
      } as unknown as DbClient),
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
    groundedPicks.writer = null;
    groundedPicks.legacyLesson = null;
    groundedPicks.verifier = null;
    groundedPicks.advisor = null;
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

    /** A lesson that passes the code checks, with `text` as its paragraph. */
    function cleanBlocks(text: string) {
      return [
        { type: 'paragraph', text },
        { type: 'takeaways', items: ['Types: they catch mistakes early.'] },
        { type: 'completion_criteria', items: ['Explain what a type is.'] },
      ];
    }

    /** Writes each lesson with `text(taskId, attempt)` as its paragraph. */
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
                  blocks: cleanBlocks(text(taskId, attempt)),
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

    it("adds the plan's regeneration reasons and fenced note to each lesson prompt", async () => {
      plan.feedback = {
        regenerationReasons: ['too_basic'],
        regenerationNote: 'More practice please',
      };
      writerReturning(() => 'Typed [S1].');
      const { deps } = groundedDeps();
      const { step } = createStep();

      try {
        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });
      } finally {
        plan.feedback = { regenerationReasons: null, regenerationNote: null };
      }

      const [first] = writer.write.mock.calls[0] ?? [];
      const reason = first.userParts.find((part: { text: string }) =>
        part.text.startsWith('REGENERATION FEEDBACK'),
      );
      expect(reason?.text).toContain(REGENERATION_REASON_GUIDANCE.too_basic);
      expect(reason?.text).toContain(
        '---BEGIN LEARNER NOTE---\nMore practice please\n---END LEARNER NOTE---',
      );
    });

    it('sends no regeneration block when the plan has no reasons or note', async () => {
      writerReturning(() => 'Typed [S1].');
      const { deps } = groundedDeps();
      const { step } = createStep();

      await expect(
        runModuleLessonsWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      const [first] = writer.write.mock.calls[0] ?? [];
      expect(
        first.userParts.some((part: { text: string }) =>
          part.text.startsWith('REGENERATION FEEDBACK'),
        ),
      ).toBe(false);
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
                    blocks: cleanBlocks('Hi'),
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

    describe('checks and repair', () => {
      type QualityCall = {
        stage: string;
        tier: string;
        presetSlug: string;
        models: Array<{ modelId: string }>;
        serverTools?: Array<{ type: string; model: string }>;
        toolChoice?: string;
        userParts: Array<{ text: string; cache?: boolean }>;
      };

      function qualityCalls(stage: string): QualityCall[] {
        return quality.call.mock.calls
          .map(([call]) => call as QualityCall)
          .filter((call) => call.stage === stage);
      }

      /** Writes TASK_A without completion criteria; TASK_B is clean. */
      function writerFlaggingTaskA() {
        writer.write.mockImplementation(async (call) => {
          const taskId = promptTaskId(call) ?? '';
          const blocks = cleanBlocks('Typed [S1].');
          return {
            rawText: JSON.stringify({
              version: 1,
              tasks: [
                {
                  taskId,
                  content: {
                    version: 1,
                    blocks: taskId === TASK_A ? blocks.slice(0, 2) : blocks,
                  },
                },
              ],
            }),
            usage: usage(),
          };
        });
      }

      /** Verifier reports `issues(lessonText)`; repair returns `repaired`. */
      function qualityReturning(options: {
        verifierIssues?: (prompt: string) => unknown[];
        repaired?: () => unknown;
      }) {
        quality.call.mockImplementation(async (call: QualityCall) => {
          const prompt = call.userParts.at(-1)?.text ?? '';
          const value =
            call.stage === 'grounded-lesson-verify'
              ? { issues: options.verifierIssues?.(prompt) ?? [] }
              : (options.repaired?.() ?? {
                  blocks: cleanBlocks('Fixed [S1].'),
                });
          return { value, usage: usage(), model: 'quality-model' };
        });
      }

      beforeEach(() => {
        quality.insert.mockResolvedValue([]);
        quality.list.mockResolvedValue([]);
        qualityReturning({});
      });

      it('runs code checks only on free, repairs without the advisor, and logs issues', async () => {
        writerFlaggingTaskA();
        // The repair never adds completion criteria, so both passes run.
        qualityReturning({
          repaired: () => ({ blocks: cleanBlocks('Still [S1].').slice(0, 2) }),
        });
        const { deps } = groundedDeps();
        const { step, calls } = createStep();

        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });

        const names = calls.map((call) => call.name);
        expect(names.filter((name) => name.includes('-verify-'))).toEqual([]);
        expect(names.filter((name) => name.includes('-repair-'))).toEqual([
          'lesson-1-repair-1',
          'lesson-1-repair-2',
        ]);
        expect(names.slice(-2)).toEqual([
          'lessons-quality-save',
          'parse-commit',
        ]);
        const repairs = qualityCalls('grounded-lesson-repair');
        expect(repairs).toHaveLength(2);
        for (const call of repairs) {
          expect(call).toMatchObject({
            tier: 'free',
            presetSlug: 'atlaris-grounded-repair',
          });
          expect(call.serverTools).toBeUndefined();
          expect(call.toolChoice).toBeUndefined();
        }

        const [rows] = quality.insert.mock.calls[0] ?? [];
        expect(rows).toEqual([
          expect.objectContaining({
            planId: PLAN_ID,
            moduleId: MODULE_ID,
            taskId: TASK_A,
            stage: 'lesson',
            blockRef: 'lesson',
            issueCode: 'missing_completion_criteria',
            pass: 0,
            resolved: false,
          }),
        ]);
        const [, committed] = queries.commitSuccess.mock.calls[0] ?? [];
        // Six calls: two lessons and two repairs, one usage each.
        expect(committed.usage.inputTokens).toBe(40);
      });

      it('reads the synced catalog inside verify and repair steps', async () => {
        tier.value = 'pro';
        qualityReturning({
          verifierIssues: (prompt) =>
            prompt.includes('Typed [S1].')
              ? [{ code: 'x', blockRef: 'blocks[0]', message: 'Off topic.' }]
              : [],
          repaired: () => ({
            blocks: [
              { index: 0, block: { type: 'paragraph', text: 'Fixed [S1].' } },
            ],
          }),
        });
        const answer = quality.call.getMockImplementation()!;
        const probes: Record<string, unknown>[] = [];
        quality.call.mockImplementation(async (call: QualityCall) => {
          probes.push({ stage: call.stage, ...(await probeCatalog()) });
          return answer(call);
        });
        const catalog = catalogReadsRequireDb();
        const { deps: base } = groundedDeps();
        const { deps } = groundedDeps({
          withDb: (fn) => catalog.scoped(() => base.withDb(fn)),
        });
        const { step } = createStep();

        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });

        expect(new Set(probes.map((probe) => probe.stage))).toEqual(
          new Set(['grounded-lesson-verify', 'grounded-lesson-repair']),
        );
        for (const probe of probes) {
          expect(probe).toMatchObject(PRICED_PROBE);
        }
      });

      it('verifies on paid tiers, repairs with the advisor required, and stops once clean', async () => {
        tier.value = 'pro';
        qualityReturning({
          // The first draft of every lesson says "Typed"; the repair fixes it.
          verifierIssues: (prompt) =>
            prompt.includes('Typed [S1].')
              ? [
                  {
                    code: 'title mismatch',
                    blockRef: 'blocks[0]',
                    message: 'The paragraph does not match the title.',
                  },
                ]
              : [],
          repaired: () => ({
            blocks: [
              { index: 0, block: { type: 'paragraph', text: 'Fixed [S1].' } },
            ],
          }),
        });
        const { deps } = groundedDeps();
        const { step, calls } = createStep();

        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });

        const names = calls.map((call) => call.name);
        for (const lesson of [1, 2]) {
          expect(names).toEqual(
            expect.arrayContaining([
              `lesson-${lesson}-verify-0`,
              `lesson-${lesson}-repair-1`,
              `lesson-${lesson}-verify-1`,
            ]),
          );
          expect(names).not.toContain(`lesson-${lesson}-repair-2`);
        }
        const repairs = qualityCalls('grounded-lesson-repair');
        expect(repairs).toHaveLength(2);
        for (const call of repairs) {
          expect(call.toolChoice).toBe('required');
          expect(call.serverTools).toEqual([
            expect.objectContaining({
              type: 'advisor',
              model: 'anthropic/claude-opus-5.5',
            }),
          ]);
        }
        expect(qualityCalls('grounded-lesson-verify')[0]).toMatchObject({
          presetSlug: 'atlaris-grounded-verifier',
        });

        const [, committed] = queries.commitSuccess.mock.calls[0] ?? [];
        expect(
          committed.parsed.tasks.map(
            (task: { content: { blocks: Array<{ text?: string }> } }) =>
              task.content.blocks[0]?.text,
          ),
        ).toEqual(['Fixed [S1].', 'Fixed [S1].']);
        const [rows] = quality.insert.mock.calls[0] ?? [];
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row).toMatchObject({
            stage: 'lesson',
            blockRef: 'blocks[0]',
            issueCode: 'verifier.title_mismatch',
            pass: 0,
            resolved: true,
          });
        }
      });

      describe('saved verifier and advisor picks', () => {
        /** One flagged lesson, so one verifier call and one repair run. */
        async function runFlaggedLesson() {
          taskIds = [TASK_A];
          qualityReturning({
            verifierIssues: (prompt) =>
              prompt.includes('Typed [S1].')
                ? [{ code: 'x', blockRef: 'blocks[0]', message: 'm' }]
                : [],
            repaired: () => ({
              blocks: [
                { index: 0, block: { type: 'paragraph', text: 'Fixed [S1].' } },
              ],
            }),
          });
          const { deps } = groundedDeps();
          const { step } = createStep();
          await expect(
            runModuleLessonsWorkflow(event(), step, deps),
          ).resolves.toEqual({ kind: 'success' });
          return {
            verifierModel: qualityCalls('grounded-lesson-verify')[0]?.models[0]
              ?.modelId,
            advisorModel: qualityCalls('grounded-lesson-repair')[0]
              ?.serverTools?.[0]?.model,
          };
        }

        it('leads with the Pro saved picks', async () => {
          tier.value = 'pro';
          groundedPicks.verifier = 'openai/gpt-6-sol';
          groundedPicks.advisor = 'anthropic/claude-haiku-5.5';

          await expect(runFlaggedLesson()).resolves.toEqual({
            verifierModel: 'openai/gpt-6-sol',
            advisorModel: 'anthropic/claude-haiku-5.5',
          });
        });

        it('uses the tier defaults when Pro has no saved picks', async () => {
          tier.value = 'pro';

          await expect(runFlaggedLesson()).resolves.toEqual({
            verifierModel: 'anthropic/claude-sonnet-5.5',
            advisorModel: 'anthropic/claude-opus-5.5',
          });
        });

        it('ignores saved picks below Pro', async () => {
          tier.value = 'starter';
          groundedPicks.verifier = 'openai/gpt-6-sol';
          groundedPicks.advisor = 'anthropic/claude-haiku-5.5';

          await expect(runFlaggedLesson()).resolves.toEqual({
            verifierModel: 'openai/gpt-6.1-sol',
            advisorModel: 'openai/gpt-6.1-sol',
          });
        });
      });

      describe('saved writer pick (JCS-169)', () => {
        /** One flagged lesson, so one writer call and one repair run. */
        async function runFlaggedLesson() {
          taskIds = [TASK_A];
          writerFlaggingTaskA();
          const { deps } = groundedDeps();
          const { step } = createStep();
          await expect(
            runModuleLessonsWorkflow(event(), step, deps),
          ).resolves.toEqual({ kind: 'success' });
          const [written] = writer.write.mock.calls[0] ?? [];
          return {
            writerModel: (written as { models: Array<{ modelId: string }> })
              .models[0]?.modelId,
            repairModel: qualityCalls('grounded-lesson-repair')[0]?.models[0]
              ?.modelId,
          };
        }

        it('writes and repairs Pro lessons with the writer pick, ignoring the legacy lesson pick', async () => {
          tier.value = 'pro';
          groundedPicks.writer = 'anthropic/claude-haiku-5.5';
          groundedPicks.legacyLesson = 'anthropic/claude-haiku-5.5';

          await expect(runFlaggedLesson()).resolves.toEqual({
            writerModel: 'anthropic/claude-haiku-5.5',
            repairModel: 'anthropic/claude-haiku-5.5',
          });
        });

        it.each([
          ['no writer pick is saved', null],
          ['the writer pick is not in the catalog', 'not/in-catalog'],
        ])('uses the Pro writer default when %s', async (_case, pick) => {
          tier.value = 'pro';
          groundedPicks.writer = pick;
          groundedPicks.legacyLesson = 'anthropic/claude-haiku-5.5';

          await expect(runFlaggedLesson()).resolves.toEqual({
            writerModel: 'openai/gpt-6-sol',
            repairModel: 'openai/gpt-6-sol',
          });
        });

        it('ignores a writer pick below Pro', async () => {
          tier.value = 'starter';
          groundedPicks.writer = 'anthropic/claude-haiku-5.5';
          groundedPicks.legacyLesson = 'anthropic/claude-haiku-5.5';
          const { writerModel, repairModel } = await runFlaggedLesson();

          expect(writerModel).not.toBe('anthropic/claude-haiku-5.5');
          expect(writerModel).not.toBe('anthropic/claude-haiku-5.5');
          expect(repairModel).toBe(writerModel);
        });
      });

      it('runs exactly two repair passes on a paid lesson that stays flagged', async () => {
        tier.value = 'starter';
        taskIds = [TASK_A];
        qualityReturning({
          verifierIssues: () => [
            {
              code: 'answer_key',
              blockRef: 'blocks[0]',
              message: 'Wrong key.',
            },
          ],
          repaired: () => ({
            blocks: [
              { index: 0, block: { type: 'paragraph', text: 'Again [S1].' } },
            ],
          }),
        });
        const { deps } = groundedDeps();
        const { step, calls } = createStep();

        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });

        expect(calls.map((call) => call.name)).toEqual([
          'claim',
          'lesson-1',
          'lesson-1-verify-0',
          'lesson-1-repair-1',
          'lesson-1-verify-1',
          'lesson-1-repair-2',
          'lesson-1-verify-2',
          'lessons-quality-save',
          'parse-commit',
        ]);
        const [rows] = quality.insert.mock.calls[0] ?? [];
        expect(rows).toEqual([
          expect.objectContaining({
            issueCode: 'verifier.answer_key',
            pass: 0,
            resolved: false,
          }),
        ]);
      });

      describe('plan AI ceiling (JCS-170)', () => {
        /** Pro ceiling $2.50; optional steps stop at 80%. */
        const CUTOFF_MICROUSD = 2_000_000;

        function stillFlagged() {
          taskIds = [TASK_A];
          qualityReturning({
            verifierIssues: () => [
              { code: 'answer_key', blockRef: 'blocks[0]', message: 'Wrong.' },
            ],
            repaired: () => ({
              blocks: [
                { index: 0, block: { type: 'paragraph', text: 'Again [S1].' } },
              ],
            }),
          });
        }

        it('drops the advisor and the second repair near the ceiling, and records both cuts', async () => {
          tier.value = 'pro';
          budget.spent.mockResolvedValueOnce(CUTOFF_MICROUSD);
          stillFlagged();
          const { deps } = groundedDeps();
          const { step, calls } = createStep();

          await expect(
            runModuleLessonsWorkflow(event(), step, deps),
          ).resolves.toEqual({ kind: 'success' });

          expect(calls.map((call) => call.name)).toEqual([
            'claim',
            'lesson-1',
            'lesson-1-verify-0',
            'lesson-1-repair-1',
            'lesson-1-verify-1',
            'lessons-quality-save',
            'parse-commit',
          ]);
          const [repair] = qualityCalls('grounded-lesson-repair');
          expect(repair?.serverTools).toBeUndefined();
          expect(repair?.toolChoice).toBeUndefined();
          // Snapshot plus this lesson's 100-micro-USD calls before each cut.
          const [cuts] = budget.insert.mock.calls[0] ?? [];
          expect(cuts).toEqual([
            {
              planId: PLAN_ID,
              moduleId: MODULE_ID,
              taskId: TASK_A,
              step: 'advisor',
              pass: 1,
              spentMicrousd: CUTOFF_MICROUSD + 200,
              ceilingMicrousd: 2_500_000,
            },
            {
              planId: PLAN_ID,
              moduleId: MODULE_ID,
              taskId: TASK_A,
              step: 'repair',
              pass: 2,
              spentMicrousd: CUTOFF_MICROUSD + 400,
              ceilingMicrousd: 2_500_000,
            },
          ]);
          expect(quality.insert).toHaveBeenCalledOnce();
        });

        it('runs every optional step below the cutoff', async () => {
          tier.value = 'pro';
          budget.spent.mockResolvedValueOnce(CUTOFF_MICROUSD - 1_000);
          stillFlagged();
          const { deps } = groundedDeps();
          const { step, calls } = createStep();

          await expect(
            runModuleLessonsWorkflow(event(), step, deps),
          ).resolves.toEqual({ kind: 'success' });

          expect(calls.map((call) => call.name)).toContain('lesson-1-repair-2');
          for (const call of qualityCalls('grounded-lesson-repair')) {
            expect(call.toolChoice).toBe('required');
          }
          expect(budget.insert).toHaveBeenCalledWith([], expect.anything());
        });

        it('records no advisor cut on free, which has no advisor', async () => {
          budget.spent.mockResolvedValueOnce(40_000);
          writerFlaggingTaskA();
          // The repair never adds completion criteria, so pass 2 is due.
          qualityReturning({
            repaired: () => ({
              blocks: cleanBlocks('Still [S1].').slice(0, 2),
            }),
          });
          const { deps } = groundedDeps();
          const { step, calls } = createStep();

          await expect(
            runModuleLessonsWorkflow(event(), step, deps),
          ).resolves.toEqual({ kind: 'success' });

          const names = calls.map((call) => call.name);
          expect(names).toContain('lesson-1-repair-1');
          expect(names).not.toContain('lesson-1-repair-2');
          const [cuts] = budget.insert.mock.calls[0] ?? [];
          expect(cuts).toEqual([
            expect.objectContaining({
              step: 'repair',
              pass: 2,
              ceilingMicrousd: 50_000,
            }),
          ]);
        });

        it('does not save the cuts twice when a retry finds its own rows', async () => {
          tier.value = 'pro';
          budget.spent.mockResolvedValueOnce(CUTOFF_MICROUSD);
          stillFlagged();
          budget.insert.mockImplementationOnce(async () => {
            throw new Error('connection reset after insert');
          });
          budget.count.mockResolvedValueOnce(2);
          const { deps } = groundedDeps();
          const { step, calls } = createStep();

          await expect(
            runModuleLessonsWorkflow(event(), step, deps),
          ).resolves.toEqual({ kind: 'success' });

          expect(budget.insert).toHaveBeenCalledOnce();
          expect(budget.count).toHaveBeenCalledWith(
            PLAN_ID,
            MODULE_ID,
            expect.anything(),
            expect.any(Date),
          );
          expect(
            calls.find((call) => call.name === 'lessons-quality-save')
              ?.attempts,
          ).toBe(2);
        });
      });

      it('keeps the written lesson when the repair output is not a valid lesson', async () => {
        writerFlaggingTaskA();
        qualityReturning({ repaired: () => ({ blocks: [] }) });
        const { deps, logger } = groundedDeps();
        const { step } = createStep();

        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });

        const [, committed] = queries.commitSuccess.mock.calls[0] ?? [];
        expect(committed.parsed.tasks[0].content.blocks).toHaveLength(2);
        expect(
          logger.warn.mock.calls.filter(
            ([fields]) =>
              (fields as { outcome?: string }).outcome === 'failed_skipped',
          ),
        ).toHaveLength(2);
      });

      it('ships the lesson with code checks when the verifier fails', async () => {
        tier.value = 'pro';
        taskIds = [TASK_A];
        quality.call.mockRejectedValue(new Error('provider down'));
        const { deps } = groundedDeps();
        const { step, calls } = createStep();

        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });

        expect(calls.map((call) => call.name)).toEqual([
          'claim',
          'lesson-1',
          'lesson-1-verify-0',
          'parse-commit',
        ]);
        expect(quality.insert).not.toHaveBeenCalled();
      });

      it('does not save the issues twice when a retry finds its own rows', async () => {
        writerFlaggingTaskA();
        quality.insert
          .mockImplementationOnce(async () => {
            throw new Error('connection reset after insert');
          })
          .mockResolvedValue([]);
        quality.list.mockResolvedValue([
          {
            stage: 'lesson',
            moduleId: MODULE_ID,
            createdAt: new Date(NOW.getTime() + 1_000),
          },
        ]);
        const { deps } = groundedDeps();
        const { step, calls } = createStep();

        await expect(
          runModuleLessonsWorkflow(event(), step, deps),
        ).resolves.toEqual({ kind: 'success' });

        expect(quality.insert).toHaveBeenCalledOnce();
        expect(
          calls.find((call) => call.name === 'lessons-quality-save')?.attempts,
        ).toBe(2);
      });
    });

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
