import type { MeteredReservationToken } from '@/features/billing/metered-reservation';
import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { DbClient } from '@/lib/db/types';

import { getDefaultModelForTier } from '@/features/ai/ai-models';
import { runLessonGenerationQuotaReserved } from '@/features/billing/lesson-generation-quota-boundary';
import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import { makeDbClient } from '@tests/fixtures/db-mocks';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  commitFailure: vi.fn(),
  commitSuccess: vi.fn(),
  revertClaim: vi.fn(),
  markProviderStarted: vi.fn(),
  invokeProvider: vi.fn(),
  parseBatch: vi.fn(),
  resolveModelForTier: vi.fn(),
  setupAbortAndTimeout: vi.fn(),
  reserve: vi.fn(),
  compensate: vi.fn(),
  resolveUserTier: vi.fn(),
  getUserPreferences: vi.fn(),
}));

vi.mock('@/lib/db/queries/module-lesson-generation', () => ({
  commitModuleLessonBatchSuccess: mocks.commitSuccess,
  commitModuleLessonGenerationFailure: mocks.commitFailure,
  markModuleLessonProviderStarted: mocks.markProviderStarted,
  revertModuleLessonGeneratingToNotGenerated: mocks.revertClaim,
}));

vi.mock('@/features/ai/orchestrator/provider-invocation', () => ({
  generateModuleLessonBatchWithInstrumentation: mocks.invokeProvider,
}));

vi.mock('@/features/lesson-content/parse-module-lesson-batch', () => ({
  parseModuleLessonBatchFromStream: mocks.parseBatch,
}));

vi.mock('@/features/ai/model-resolver', () => ({
  resolveModelForTier: mocks.resolveModelForTier,
}));

vi.mock('@/features/billing/tier', () => ({
  resolveUserTier: mocks.resolveUserTier,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getUserPreferences: mocks.getUserPreferences,
}));

vi.mock(
  '@/features/ai/orchestrator/timeout-lifecycle',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/ai/orchestrator/timeout-lifecycle')
      >();
    return {
      ...actual,
      setupAbortAndTimeout: mocks.setupAbortAndTimeout,
    };
  },
);

const fakeDb = makeDbClient();
const baseToken: MeteredReservationToken = {
  userId: 'user-quota',
  month: '2026-08',
  meter: 'lessonGeneration',
  limit: 3,
  newCount: 1,
};

const runLessonQuotaReserved: typeof runLessonGenerationQuotaReserved = (
  args,
) =>
  runLessonGenerationQuotaReserved(args, {
    reserve: mocks.reserve,
    compensate: mocks.compensate,
    reportReconciliation: vi.fn(),
  });

function fakeLifecycle() {
  const controller = new AbortController();
  return {
    timeout: { cancel: vi.fn(), signal: controller.signal },
    controller,
    cleanupTimeoutAbort: vi.fn(),
    cleanupExternalAbort: undefined,
  };
}

function parsedBatch(taskId: string) {
  return {
    version: 1 as const,
    tasks: [
      {
        taskId,
        content: {
          version: 1 as const,
          blocks: [{ type: 'heading' as const, text: 'h' }],
        },
      },
    ],
  };
}

function providerOk() {
  return {
    stream: {} as ReadableStream<Uint8Array>,
    metadata: {
      provider: 'mock',
      model: 'mock-module-lesson-batch-v1',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    },
  };
}

describe('runModuleLessonGenerationWork', () => {
  beforeEach(() => {
    mocks.revertClaim.mockReset();
    mocks.revertClaim.mockResolvedValue(undefined);
    mocks.commitFailure.mockReset();
    mocks.commitFailure.mockResolvedValue(undefined);
    mocks.commitSuccess.mockReset();
    mocks.commitSuccess.mockResolvedValue(undefined);
    mocks.markProviderStarted.mockReset();
    mocks.markProviderStarted.mockResolvedValue(undefined);
    mocks.invokeProvider.mockReset();
    mocks.parseBatch.mockReset();
    mocks.resolveModelForTier.mockReset();
    mocks.setupAbortAndTimeout.mockReset();
    mocks.setupAbortAndTimeout.mockImplementation(fakeLifecycle);
    mocks.reserve.mockReset();
    mocks.reserve.mockResolvedValue({ ok: true, token: baseToken });
    mocks.compensate.mockReset();
    mocks.compensate.mockResolvedValue(undefined);
    mocks.resolveUserTier.mockReset();
    mocks.resolveUserTier.mockResolvedValue('free');
    mocks.getUserPreferences.mockReset();
    mocks.getUserPreferences.mockResolvedValue({
      preferredAiModel: null,
      preferredRegenerationAiModel: null,
      preferredLessonAiModel: null,
      analyticsTimezone: 'UTC',
    });
  });

  it('releases an already-claimed module when generation is disabled', async () => {
    const userId = createId('user');
    const planId = createId('plan');
    const moduleId = createId('module');
    const serverDbClient = {} as DbClient;
    const workflowRunId = 'wrun_disabled';

    await expect(
      runModuleLessonGenerationWork(
        {
          load: {} as ModuleLessonGenerationContext,
          userId,
          planId,
          moduleId,
          userTier: 'free',
          generationMetadata: {
            version: 1,
            workflow: {
              provider: 'workflow-sdk',
              runId: workflowRunId,
            },
          },
        },
        {
          serverDbClient,
          resolveGenerationEnabled: async () => false,
        },
      ),
    ).resolves.toEqual({ kind: 'disabled' });

    expect(mocks.revertClaim).toHaveBeenCalledOnce();
    expect(mocks.revertClaim).toHaveBeenCalledWith(serverDbClient, {
      userId,
      planId,
      moduleId,
      workflowRunId,
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('persists the provider-start marker before invoking the fake provider', async () => {
    const userId = createId('user');
    const planId = createId('plan');
    const moduleId = createId('module');
    const taskId = createId('task');
    const serverDbClient = fakeDb;
    const order: string[] = [];
    const now = () => new Date('2026-08-20T18:00:00.000Z');

    mocks.markProviderStarted.mockImplementation(async () => {
      order.push('marker');
    });
    mocks.invokeProvider.mockImplementation(async () => {
      order.push('provider');
      throw new Error('provider');
    });

    await runModuleLessonGenerationWork(
      {
        load: {
          plan: { topic: 't', skillLevel: 'beginner', learningStyle: 'mixed' },
          module: { title: 'm', description: null, order: 1 },
          tasks: [{ id: taskId, title: 'Task', order: 1 }],
          isUnlocked: true,
        } as never,
        userId,
        planId,
        moduleId,
        userTier: 'free',
        now,
      },
      {
        serverDbClient,
        resolveGenerationEnabled: async () => true,
        runLessonQuotaReserved,
        provider: { generateModuleLessonBatch: vi.fn() },
      },
    );

    expect(order).toEqual(['marker', 'provider']);
    expect(mocks.markProviderStarted).toHaveBeenCalledWith(serverDbClient, {
      userId,
      planId,
      moduleId,
      providerStartedAt: '2026-08-20T18:00:00.000Z',
    });
  });

  it.each([
    {
      name: 'provider',
      arrange: () => {
        mocks.invokeProvider.mockRejectedValue(new Error('provider'));
      },
    },
    {
      name: 'parser',
      arrange: () => {
        mocks.invokeProvider.mockResolvedValue(providerOk());
        mocks.parseBatch.mockRejectedValue(new Error('parse'));
      },
    },
    {
      name: 'success persistence',
      arrange: (taskId: string) => {
        mocks.invokeProvider.mockResolvedValue(providerOk());
        mocks.parseBatch.mockResolvedValue(parsedBatch(taskId));
        mocks.commitSuccess.mockRejectedValue(new Error('persist'));
      },
    },
  ])(
    '$name failure after marker returns failed, keeps reservation consumed, and never compensates',
    async ({ arrange }) => {
      const userId = createId('user');
      const planId = createId('plan');
      const moduleId = createId('module');
      const taskId = createId('task');
      arrange(taskId);

      const result = await runModuleLessonGenerationWork(
        {
          load: {
            plan: {
              topic: 't',
              skillLevel: 'beginner',
              learningStyle: 'mixed',
            },
            module: { title: 'm', description: null, order: 1 },
            tasks: [{ id: taskId, title: 'Task', order: 1 }],
            isUnlocked: true,
          } as never,
          userId,
          planId,
          moduleId,
          userTier: 'free',
        },
        {
          serverDbClient: fakeDb,
          resolveGenerationEnabled: async () => true,
          runLessonQuotaReserved,
          provider: { generateModuleLessonBatch: vi.fn() },
        },
      );

      expect(result).toEqual({ kind: 'failed' });
      expect(mocks.markProviderStarted).toHaveBeenCalledOnce();
      expect(mocks.invokeProvider).toHaveBeenCalledOnce();
      expect(mocks.reserve).toHaveBeenCalledOnce();
      expect(mocks.compensate).not.toHaveBeenCalled();
      expect(mocks.revertClaim).not.toHaveBeenCalled();
    },
  );

  it('treats failure-state persistence failure after marker as consumed', async () => {
    mocks.invokeProvider.mockRejectedValue(new Error('provider'));
    mocks.commitFailure.mockRejectedValue(new Error('failure persist'));

    const result = await runModuleLessonGenerationWork(
      {
        load: {
          plan: { topic: 't', skillLevel: 'beginner', learningStyle: 'mixed' },
          module: { title: 'm', description: null, order: 1 },
          tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
          isUnlocked: true,
        } as never,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'free',
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
        runLessonQuotaReserved,
        provider: { generateModuleLessonBatch: vi.fn() },
      },
    );

    expect(result).toEqual({ kind: 'failed' });
    expect(mocks.compensate).not.toHaveBeenCalled();
    expect(mocks.revertClaim).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'marker persistence',
      omitProvider: false,
      arrange: () => {
        mocks.markProviderStarted.mockRejectedValue(new Error('marker'));
      },
    },
    {
      name: 'provider resolution',
      omitProvider: true,
      arrange: () => {
        mocks.resolveModelForTier.mockImplementation(() => {
          throw new Error('provider init');
        });
      },
    },
    {
      name: 'lifecycle setup',
      omitProvider: false,
      arrange: () => {
        mocks.setupAbortAndTimeout.mockImplementation(() => {
          throw new Error('lifecycle');
        });
      },
    },
  ])(
    '$name failure before provider invocation compensates',
    async ({ omitProvider, arrange }) => {
      arrange();

      const result = await runModuleLessonGenerationWork(
        {
          load: {
            plan: {
              topic: 't',
              skillLevel: 'beginner',
              learningStyle: 'mixed',
            },
            module: { title: 'm', description: null, order: 1 },
            tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
            isUnlocked: true,
          } as never,
          userId: createId('user'),
          planId: createId('plan'),
          moduleId: createId('module'),
          userTier: 'free',
        },
        {
          serverDbClient: fakeDb,
          resolveGenerationEnabled: async () => true,
          runLessonQuotaReserved,
          ...(omitProvider
            ? {}
            : { provider: { generateModuleLessonBatch: vi.fn() } }),
        },
      );

      expect(result).toEqual({ kind: 'failed' });
      expect(mocks.invokeProvider).not.toHaveBeenCalled();
      expect(mocks.compensate).toHaveBeenCalledOnce();
      expect(mocks.compensate).toHaveBeenCalledWith(baseToken, fakeDb);
      if (omitProvider) {
        expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
          'free',
          undefined,
          'lesson',
        );
      }
    },
  );

  it('compensates and reverts when pre-provider failure persistence also fails', async () => {
    mocks.markProviderStarted.mockRejectedValue(new Error('marker'));
    mocks.commitFailure.mockRejectedValue(new Error('failure persist'));

    const result = await runModuleLessonGenerationWork(
      {
        load: {
          plan: { topic: 't', skillLevel: 'beginner', learningStyle: 'mixed' },
          module: { title: 'm', description: null, order: 1 },
          tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
          isUnlocked: true,
        } as never,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'free',
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
        runLessonQuotaReserved,
        provider: { generateModuleLessonBatch: vi.fn() },
      },
    );

    expect(result).toEqual({ kind: 'failed' });
    expect(mocks.invokeProvider).not.toHaveBeenCalled();
    expect(mocks.compensate).toHaveBeenCalledWith(baseToken, fakeDb);
    expect(mocks.revertClaim).toHaveBeenCalledOnce();
  });

  it('reserves again on a second retry after a consumed provider-started failure', async () => {
    mocks.invokeProvider.mockRejectedValue(new Error('provider'));
    const params = {
      load: {
        plan: { topic: 't', skillLevel: 'beginner', learningStyle: 'mixed' },
        module: { title: 'm', description: null, order: 1 },
        tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
        isUnlocked: true,
      } as never,
      userId: createId('user'),
      planId: createId('plan'),
      moduleId: createId('module'),
      userTier: 'free' as const,
    };
    const deps = {
      serverDbClient: fakeDb,
      resolveGenerationEnabled: async () => true,
      runLessonQuotaReserved,
      provider: { generateModuleLessonBatch: vi.fn() },
    };

    await expect(runModuleLessonGenerationWork(params, deps)).resolves.toEqual({
      kind: 'failed',
    });
    await expect(runModuleLessonGenerationWork(params, deps)).resolves.toEqual({
      kind: 'failed',
    });

    expect(mocks.reserve).toHaveBeenCalledTimes(2);
    expect(mocks.compensate).not.toHaveBeenCalled();
  });

  it('uses the Pro saved lesson slot when modelOverride is omitted', async () => {
    mocks.resolveUserTier.mockResolvedValue('pro');
    mocks.getUserPreferences.mockResolvedValue({
      preferredAiModel: 'openai/gpt-5.2',
      preferredRegenerationAiModel: 'google/gemini-3-pro-preview',
      preferredLessonAiModel: 'google/gemini-3-flash-preview',
      analyticsTimezone: 'UTC',
    });
    mocks.resolveModelForTier.mockReturnValue({
      provider: { generateModuleLessonBatch: vi.fn() },
      modelId: 'google/gemini-3-flash-preview',
    });
    mocks.invokeProvider.mockResolvedValue(providerOk());
    mocks.parseBatch.mockResolvedValue(parsedBatch(createId('task')));

    const userId = createId('user');
    await runModuleLessonGenerationWork(
      {
        load: {
          plan: { topic: 't', skillLevel: 'beginner', learningStyle: 'mixed' },
          module: { title: 'm', description: null, order: 1 },
          tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
          isUnlocked: true,
        } as never,
        userId,
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'pro',
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
        runLessonQuotaReserved,
      },
    );

    expect(mocks.resolveUserTier).toHaveBeenCalledWith(userId, fakeDb);
    expect(mocks.getUserPreferences).toHaveBeenCalledWith(userId, fakeDb);
    expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
      'pro',
      'google/gemini-3-flash-preview',
      'lesson',
    );
  });

  it.each(['free', 'starter'] as const)(
    '%s lesson work without modelOverride resolves openrouter/free',
    async (tier) => {
      mocks.resolveUserTier.mockResolvedValue(tier);
      mocks.resolveModelForTier.mockReturnValue({
        provider: { generateModuleLessonBatch: vi.fn() },
        modelId: AI_DEFAULT_MODEL,
      });
      mocks.invokeProvider.mockResolvedValue(providerOk());
      mocks.parseBatch.mockResolvedValue(parsedBatch(createId('task')));

      await runModuleLessonGenerationWork(
        {
          load: {
            plan: {
              topic: 't',
              skillLevel: 'beginner',
              learningStyle: 'mixed',
            },
            module: { title: 'm', description: null, order: 1 },
            tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
            isUnlocked: true,
          } as never,
          userId: createId('user'),
          planId: createId('plan'),
          moduleId: createId('module'),
          userTier: tier,
        },
        {
          serverDbClient: fakeDb,
          resolveGenerationEnabled: async () => true,
          runLessonQuotaReserved,
        },
      );

      expect(getDefaultModelForTier(tier, 'lesson')).toBe(AI_DEFAULT_MODEL);
      expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
        tier,
        undefined,
        'lesson',
      );
    },
  );

  it('replaces a stale workflow userTier with the current DB tier', async () => {
    mocks.resolveUserTier.mockResolvedValue('pro');
    mocks.getUserPreferences.mockResolvedValue({
      preferredAiModel: null,
      preferredRegenerationAiModel: null,
      preferredLessonAiModel: 'google/gemini-3-flash-preview',
      analyticsTimezone: 'UTC',
    });
    mocks.resolveModelForTier.mockReturnValue({
      provider: { generateModuleLessonBatch: vi.fn() },
      modelId: 'google/gemini-3-flash-preview',
    });
    mocks.invokeProvider.mockResolvedValue(providerOk());
    mocks.parseBatch.mockResolvedValue(parsedBatch(createId('task')));

    await runModuleLessonGenerationWork(
      {
        load: {
          plan: { topic: 't', skillLevel: 'beginner', learningStyle: 'mixed' },
          module: { title: 'm', description: null, order: 1 },
          tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
          isUnlocked: true,
        } as never,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'free',
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
        runLessonQuotaReserved,
      },
    );

    expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
      'pro',
      'google/gemini-3-flash-preview',
      'lesson',
    );
    expect(mocks.resolveModelForTier).not.toHaveBeenCalledWith(
      'free',
      expect.anything(),
      expect.anything(),
    );
  });

  it('keeps an explicit modelOverride instead of the saved lesson slot', async () => {
    mocks.resolveUserTier.mockResolvedValue('pro');
    mocks.getUserPreferences.mockResolvedValue({
      preferredAiModel: null,
      preferredRegenerationAiModel: null,
      preferredLessonAiModel: 'google/gemini-3-flash-preview',
      analyticsTimezone: 'UTC',
    });
    mocks.resolveModelForTier.mockReturnValue({
      provider: { generateModuleLessonBatch: vi.fn() },
      modelId: 'openai/gpt-5.2',
    });
    mocks.invokeProvider.mockResolvedValue(providerOk());
    mocks.parseBatch.mockResolvedValue(parsedBatch(createId('task')));

    await runModuleLessonGenerationWork(
      {
        load: {
          plan: { topic: 't', skillLevel: 'beginner', learningStyle: 'mixed' },
          module: { title: 'm', description: null, order: 1 },
          tasks: [{ id: createId('task'), title: 'Task', order: 1 }],
          isUnlocked: true,
        } as never,
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        userTier: 'pro',
        modelOverride: 'openai/gpt-5.2',
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
        runLessonQuotaReserved,
      },
    );

    expect(mocks.getUserPreferences).not.toHaveBeenCalled();
    expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
      'pro',
      'openai/gpt-5.2',
      'lesson',
    );
  });
});
