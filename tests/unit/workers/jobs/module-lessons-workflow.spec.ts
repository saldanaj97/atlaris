import type { DbClient } from '@/lib/db/types';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

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

vi.mock('@/features/billing/tier', () => ({
  resolveUserTier: vi.fn(async () => 'free'),
}));

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

function validBatchText(): string {
  const block = { type: 'heading', text: 'Hi' };
  return JSON.stringify({
    version: 1,
    tasks: [TASK_A, TASK_B].map((taskId) => ({
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
      tasks: [TASK_A, TASK_B].map((id, index) => ({
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

  it('treats a parse failure as non-retryable and records the module failed', async () => {
    const { deps } = makeDeps({ provider: providerReturning('not json') });
    const { step, calls } = createStep();

    await expect(
      runModuleLessonsWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'failed' });

    expect(calls).toEqual([
      { name: 'claim', attempts: 1 },
      { name: 'generate', attempts: 1 },
      { name: 'parse-commit', attempts: 1 },
      { name: 'fail', attempts: 1 },
    ]);
    expect(queries.commitSuccess).not.toHaveBeenCalled();
    expect(queries.commitFailure).toHaveBeenCalledOnce();
    expect(moduleRow.status).toBe('failed');
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
});
