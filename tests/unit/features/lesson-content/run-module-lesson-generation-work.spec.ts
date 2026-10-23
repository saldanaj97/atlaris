import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { DbClient } from '@/lib/db/types';

import { getDefaultModelForTier } from '@/features/ai/ai-models';
import { STARTER_DEFAULT_MODEL_ID } from '@/features/ai/model-operation-policy';
import { planAiCeilingMicrousd } from '@/features/billing/plan-ai-budget';
import {
  lessonServedByFreeRouterFallback,
  reportLessonRouteFallback,
  resolveModuleLessonProvider,
  runModuleLessonGenerationWork,
} from '@/features/lesson-content/run-module-lesson-generation-work';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import * as Sentry from '@sentry/nextjs';
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
  resolveUserTier: vi.fn(),
  getUserPreferences: vi.fn(),
  readPlanContentAccess: vi.fn(),
  sumPlanAiSpendMicrousd: vi.fn(),
  getGenerationProviderWithModel: vi.fn(),
}));

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/db/queries/plan-ai-budget', () => ({
  sumPlanAiSpendMicrousd: mocks.sumPlanAiSpendMicrousd,
}));

vi.mock('@/features/ai/providers/factory', () => ({
  getGenerationProviderWithModel: mocks.getGenerationProviderWithModel,
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
  bufferModuleLessonBatchStream: vi.fn(async () => '{}'),
  parseModuleLessonBatchText: mocks.parseBatch,
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

vi.mock('@/features/plans/entitlement/access', () => ({
  readPlanContentAccess: mocks.readPlanContentAccess,
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

function workLoad(taskId = createId('task')) {
  return {
    plan: { topic: 't', skillLevel: 'beginner', learningStyle: 'mixed' },
    module: { title: 'm', description: null, order: 1 },
    tasks: [{ id: taskId, title: 'Task', order: 1 }],
    isUnlocked: true,
  } as never as ModuleLessonGenerationContext;
}

describe('runModuleLessonGenerationWork', () => {
  beforeEach(() => {
    mocks.sumPlanAiSpendMicrousd.mockReset();
    mocks.sumPlanAiSpendMicrousd.mockResolvedValue(0);
    mocks.getGenerationProviderWithModel.mockReset();
    vi.mocked(Sentry.captureMessage).mockClear();
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
    mocks.resolveUserTier.mockReset();
    mocks.resolveUserTier.mockResolvedValue('free');
    mocks.getUserPreferences.mockReset();
    mocks.getUserPreferences.mockResolvedValue({
      preferredAiModel: null,
      preferredRegenerationAiModel: null,
      preferredLessonAiModel: null,
      analyticsTimezone: 'UTC',
    });
    mocks.readPlanContentAccess.mockReset();
    mocks.readPlanContentAccess.mockResolvedValue('full');
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
    expect(mocks.invokeProvider).not.toHaveBeenCalled();
  });

  it('reverts a claimed module when the plan is no longer fully accessible', async () => {
    const userId = createId('user');
    const planId = createId('plan');
    const moduleId = createId('module');
    const serverDbClient = {} as DbClient;
    const workflowRunId = 'wrun_locked';
    mocks.readPlanContentAccess.mockResolvedValue('locked');

    await expect(
      runModuleLessonGenerationWork(
        {
          load: {} as ModuleLessonGenerationContext,
          userId,
          planId,
          moduleId,
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
          resolveGenerationEnabled: async () => true,
        },
      ),
    ).resolves.toEqual({ kind: 'failed' });

    expect(mocks.revertClaim).toHaveBeenCalledOnce();
    expect(mocks.revertClaim).toHaveBeenCalledWith(serverDbClient, {
      userId,
      planId,
      moduleId,
      workflowRunId,
    });
    expect(mocks.invokeProvider).not.toHaveBeenCalled();
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
        load: workLoad(taskId),
        userId,
        planId,
        moduleId,
        now,
      },
      {
        serverDbClient,
        resolveGenerationEnabled: async () => true,
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

  it('cuts the provider call off at the lesson timeout', async () => {
    const taskId = createId('task');
    mocks.invokeProvider.mockResolvedValue(providerOk());
    mocks.parseBatch.mockReturnValue(parsedBatch(taskId));

    await runModuleLessonGenerationWork(
      {
        load: workLoad(taskId),
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
        provider: { generateModuleLessonBatch: vi.fn() },
      },
    );

    expect(mocks.setupAbortAndTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ baseMs: 300_000 }),
      undefined,
    );
    expect(mocks.invokeProvider).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ timeoutMs: 300_000 }),
    );
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
        mocks.parseBatch.mockImplementation(() => {
          throw new Error('parse');
        });
      },
    },
    {
      name: 'success persistence',
      arrange: (taskId: string) => {
        mocks.invokeProvider.mockResolvedValue(providerOk());
        mocks.parseBatch.mockReturnValue(parsedBatch(taskId));
        mocks.commitSuccess.mockRejectedValue(new Error('persist'));
      },
    },
  ])(
    '$name failure after marker returns failed and does not revert the claim',
    async ({ arrange }) => {
      const taskId = createId('task');
      arrange(taskId);

      const result = await runModuleLessonGenerationWork(
        {
          load: workLoad(taskId),
          userId: createId('user'),
          planId: createId('plan'),
          moduleId: createId('module'),
        },
        {
          serverDbClient: fakeDb,
          resolveGenerationEnabled: async () => true,
          provider: { generateModuleLessonBatch: vi.fn() },
        },
      );

      expect(result).toEqual({ kind: 'failed' });
      expect(mocks.markProviderStarted).toHaveBeenCalledOnce();
      expect(mocks.invokeProvider).toHaveBeenCalledOnce();
      expect(mocks.revertClaim).not.toHaveBeenCalled();
    },
  );

  it('treats failure-state persistence failure after marker as failed without revert', async () => {
    mocks.invokeProvider.mockRejectedValue(new Error('provider'));
    mocks.commitFailure.mockRejectedValue(new Error('failure persist'));

    const result = await runModuleLessonGenerationWork(
      {
        load: workLoad(),
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
        provider: { generateModuleLessonBatch: vi.fn() },
      },
    );

    expect(result).toEqual({ kind: 'failed' });
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
    '$name failure before provider invocation returns failed',
    async ({ omitProvider, arrange }) => {
      arrange();

      const result = await runModuleLessonGenerationWork(
        {
          load: workLoad(),
          userId: createId('user'),
          planId: createId('plan'),
          moduleId: createId('module'),
        },
        {
          serverDbClient: fakeDb,
          resolveGenerationEnabled: async () => true,
          ...(omitProvider
            ? {}
            : { provider: { generateModuleLessonBatch: vi.fn() } }),
        },
      );

      expect(result).toEqual({ kind: 'failed' });
      expect(mocks.invokeProvider).not.toHaveBeenCalled();
      if (omitProvider) {
        expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
          'free',
          undefined,
          'lesson',
        );
      }
    },
  );

  it('reverts when pre-provider failure persistence also fails', async () => {
    mocks.markProviderStarted.mockRejectedValue(new Error('marker'));
    mocks.commitFailure.mockRejectedValue(new Error('failure persist'));

    const result = await runModuleLessonGenerationWork(
      {
        load: workLoad(),
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
        provider: { generateModuleLessonBatch: vi.fn() },
      },
    );

    expect(result).toEqual({ kind: 'failed' });
    expect(mocks.invokeProvider).not.toHaveBeenCalled();
    expect(mocks.revertClaim).toHaveBeenCalledOnce();
  });

  it('uses the Pro saved lesson slot when modelOverride is omitted', async () => {
    mocks.resolveUserTier.mockResolvedValue('pro');
    mocks.getUserPreferences.mockResolvedValue({
      preferredAiModel: 'openai/gpt-6.1-sol',
      preferredRegenerationAiModel: 'anthropic/claude-sonnet-5.5',
      preferredLessonAiModel: 'anthropic/claude-haiku-5.5',
      analyticsTimezone: 'UTC',
    });
    mocks.resolveModelForTier.mockReturnValue({
      provider: { generateModuleLessonBatch: vi.fn() },
      modelId: 'anthropic/claude-haiku-5.5',
    });
    mocks.invokeProvider.mockResolvedValue(providerOk());
    mocks.parseBatch.mockReturnValue(parsedBatch(createId('task')));

    const userId = createId('user');
    await runModuleLessonGenerationWork(
      {
        load: workLoad(),
        userId,
        planId: createId('plan'),
        moduleId: createId('module'),
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
      },
    );

    expect(mocks.resolveUserTier).toHaveBeenCalledWith(userId, fakeDb);
    expect(mocks.getUserPreferences).toHaveBeenCalledWith(userId, fakeDb);
    expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
      'pro',
      'anthropic/claude-haiku-5.5',
      'lesson',
    );
  });

  it.each([
    ['free', AI_DEFAULT_MODEL],
    ['starter', STARTER_DEFAULT_MODEL_ID],
  ] as const)(
    '%s lesson work without modelOverride resolves %s and ignores a saved Pro lesson pick',
    async (tier, defaultModelId) => {
      mocks.resolveUserTier.mockResolvedValue(tier);
      mocks.getUserPreferences.mockResolvedValue({
        preferredAiModel: null,
        preferredRegenerationAiModel: null,
        preferredLessonAiModel: 'anthropic/claude-haiku-5.5',
        analyticsTimezone: 'UTC',
      });
      mocks.resolveModelForTier.mockReturnValue({
        provider: { generateModuleLessonBatch: vi.fn() },
        modelId: defaultModelId,
      });
      mocks.invokeProvider.mockResolvedValue(providerOk());
      mocks.parseBatch.mockReturnValue(parsedBatch(createId('task')));

      await runModuleLessonGenerationWork(
        {
          load: workLoad(),
          userId: createId('user'),
          planId: createId('plan'),
          moduleId: createId('module'),
        },
        {
          serverDbClient: fakeDb,
          resolveGenerationEnabled: async () => true,
        },
      );

      expect(await getDefaultModelForTier(tier, 'lesson')).toBe(defaultModelId);
      expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
        tier,
        undefined,
        'lesson',
      );
    },
  );

  it('uses the current DB tier and does not accept a stale caller userTier', async () => {
    mocks.resolveUserTier.mockResolvedValue('pro');
    mocks.getUserPreferences.mockResolvedValue({
      preferredAiModel: null,
      preferredRegenerationAiModel: null,
      preferredLessonAiModel: 'anthropic/claude-haiku-5.5',
      analyticsTimezone: 'UTC',
    });
    mocks.resolveModelForTier.mockReturnValue({
      provider: { generateModuleLessonBatch: vi.fn() },
      modelId: 'anthropic/claude-haiku-5.5',
    });
    mocks.invokeProvider.mockResolvedValue(providerOk());
    mocks.parseBatch.mockReturnValue(parsedBatch(createId('task')));

    const staleCallerSnapshot = {
      load: workLoad(),
      userId: createId('user'),
      planId: createId('plan'),
      moduleId: createId('module'),
      userTier: 'free' as const,
    };

    await runModuleLessonGenerationWork(staleCallerSnapshot, {
      serverDbClient: fakeDb,
      resolveGenerationEnabled: async () => true,
    });

    expect(mocks.resolveUserTier).toHaveBeenCalledWith(
      staleCallerSnapshot.userId,
      fakeDb,
    );
    expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
      'pro',
      'anthropic/claude-haiku-5.5',
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
      preferredLessonAiModel: 'anthropic/claude-haiku-5.5',
      analyticsTimezone: 'UTC',
    });
    mocks.resolveModelForTier.mockReturnValue({
      provider: { generateModuleLessonBatch: vi.fn() },
      modelId: 'openai/gpt-6.1-sol',
    });
    mocks.invokeProvider.mockResolvedValue(providerOk());
    mocks.parseBatch.mockReturnValue(parsedBatch(createId('task')));

    await runModuleLessonGenerationWork(
      {
        load: workLoad(),
        userId: createId('user'),
        planId: createId('plan'),
        moduleId: createId('module'),
        modelOverride: 'openai/gpt-6.1-sol',
      },
      {
        serverDbClient: fakeDb,
        resolveGenerationEnabled: async () => true,
      },
    );

    expect(mocks.getUserPreferences).not.toHaveBeenCalled();
    expect(mocks.resolveModelForTier).toHaveBeenCalledWith(
      'pro',
      'openai/gpt-6.1-sol',
      'lesson',
    );
  });

  describe('resolveModuleLessonProvider plan AI ceiling', () => {
    const freeProvider = { generateModuleLessonBatch: vi.fn() };
    const lunaProvider = { generateModuleLessonBatch: vi.fn() };

    beforeEach(() => {
      mocks.resolveUserTier.mockResolvedValue('starter');
      mocks.getUserPreferences.mockResolvedValue({
        preferredAiModel: null,
        preferredRegenerationAiModel: null,
        preferredLessonAiModel: null,
        analyticsTimezone: 'UTC',
      });
      mocks.getGenerationProviderWithModel.mockReturnValue(freeProvider);
      mocks.resolveModelForTier.mockResolvedValue({
        provider: lunaProvider,
        modelId: STARTER_DEFAULT_MODEL_ID,
      });
    });

    it('runs a Starter lesson at the plan AI ceiling on the free router', async () => {
      const planId = createId('plan');
      mocks.sumPlanAiSpendMicrousd.mockResolvedValue(
        planAiCeilingMicrousd('starter'),
      );

      const resolution = await resolveModuleLessonProvider(
        { userId: createId('user'), planId },
        fakeDb,
      );

      expect(resolution).toEqual({
        provider: freeProvider,
        route: {
          tier: 'starter',
          primaryModelId: AI_DEFAULT_MODEL,
          fallbackModelIds: [],
        },
      });
      expect(mocks.sumPlanAiSpendMicrousd).toHaveBeenCalledWith(planId, fakeDb);
      expect(mocks.getGenerationProviderWithModel).toHaveBeenCalledWith(
        AI_DEFAULT_MODEL,
        'starter',
        'lesson',
      );
      expect(mocks.resolveModelForTier).not.toHaveBeenCalled();
    });

    it('runs a Starter lesson under the plan AI ceiling on GPT-6 Luna', async () => {
      mocks.sumPlanAiSpendMicrousd.mockResolvedValue(
        planAiCeilingMicrousd('starter') - 1,
      );

      const resolution = await resolveModuleLessonProvider(
        { userId: createId('user'), planId: createId('plan') },
        fakeDb,
      );

      expect(resolution).toEqual({
        provider: lunaProvider,
        route: {
          tier: 'starter',
          primaryModelId: STARTER_DEFAULT_MODEL_ID,
          fallbackModelIds: [AI_DEFAULT_MODEL],
        },
      });
      expect(mocks.getGenerationProviderWithModel).not.toHaveBeenCalled();
    });
  });

  describe('reportLessonRouteFallback', () => {
    const route = {
      tier: 'starter',
      primaryModelId: STARTER_DEFAULT_MODEL_ID,
      fallbackModelIds: [AI_DEFAULT_MODEL],
    } as const;
    const freeModel = 'nvidia/nemotron-3.5-lightning:free';

    it('ignores the primary, mock providers and routes without fallbacks', () => {
      reportLessonRouteFallback(route, {
        provider: 'openrouter',
        model: `${STARTER_DEFAULT_MODEL_ID}-20261001`,
      });
      reportLessonRouteFallback(route, {
        provider: 'mock',
        model: 'mock-module-lesson-batch-v1',
      });
      reportLessonRouteFallback(
        {
          tier: 'pro',
          primaryModelId: 'anthropic/claude-haiku-5.5',
          fallbackModelIds: [],
        },
        { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5-x' },
      );
      reportLessonRouteFallback(
        {
          tier: 'starter',
          primaryModelId: AI_DEFAULT_MODEL,
          fallbackModelIds: [],
        },
        { provider: 'openrouter', model: freeModel },
      );
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('warns and alerts when a fallback model served a paid lesson', () => {
      const warn = vi.spyOn(logger, 'warn');

      reportLessonRouteFallback(route, {
        provider: 'openrouter',
        model: freeModel,
      });

      const fields = {
        event: 'lesson_route_fallback',
        tier: 'starter',
        primaryModelId: STARTER_DEFAULT_MODEL_ID,
        servedModel: freeModel,
      };
      expect(warn).toHaveBeenCalledWith(fields, expect.any(String));
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          level: 'warning',
          fingerprint: ['lesson_route_fallback', 'starter'],
          extra: fields,
        }),
      );
      warn.mockRestore();
    });

    it.each(['openai/gpt-6-luna', 'openai/gpt-6:free'])(
      'alerts when the served slug %s only extends the primary',
      (servedModel) => {
        reportLessonRouteFallback(
          { ...route, primaryModelId: 'openai/gpt-6' },
          { provider: 'openrouter', model: servedModel },
        );

        expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('free-router fallback flag (DEV-175)', () => {
    const starterRoute = {
      tier: 'starter',
      primaryModelId: STARTER_DEFAULT_MODEL_ID,
      fallbackModelIds: [AI_DEFAULT_MODEL],
    } as const;
    const freeModel = 'nvidia/nemotron-3.5-lightning:free';

    it('flags a guardrail fallback or a free-router route fallback on a paid tier', () => {
      expect(
        lessonServedByFreeRouterFallback(
          {
            tier: 'pro',
            primaryModelId: AI_DEFAULT_MODEL,
            fallbackModelIds: [],
            freeRouterFallback: true,
          },
          false,
        ),
      ).toBe(true);
      expect(
        lessonServedByFreeRouterFallback(starterRoute, true, freeModel),
      ).toBe(true);
    });

    it('does not flag free tiers, the primary, or a non-free fallback route', () => {
      expect(lessonServedByFreeRouterFallback(undefined, true, freeModel)).toBe(
        false,
      );
      expect(
        lessonServedByFreeRouterFallback(
          { ...starterRoute, tier: 'free', freeRouterFallback: true },
          true,
          freeModel,
        ),
      ).toBe(false);
      expect(
        lessonServedByFreeRouterFallback(starterRoute, false, freeModel),
      ).toBe(false);
      expect(
        lessonServedByFreeRouterFallback(
          { ...starterRoute, fallbackModelIds: ['openai/gpt-6-mini'] },
          true,
          freeModel,
        ),
      ).toBe(false);
    });

    it.each(['openai/gpt-6-luna-preview', 'openai/gpt-6-luna:thinking'])(
      'does not flag a paid variant %s the primary check missed',
      (servedModel) => {
        expect(
          lessonServedByFreeRouterFallback(starterRoute, true, servedModel),
        ).toBe(false);
      },
    );

    it('carries a guardrail free-router fallback onto the lesson route', async () => {
      const provider = { generateModuleLessonBatch: vi.fn() };
      mocks.resolveUserTier.mockResolvedValue('pro');
      mocks.resolveModelForTier.mockResolvedValue({
        provider,
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        freeRouterFallback: true,
      });

      const resolution = await resolveModuleLessonProvider(
        { userId: createId('user'), planId: createId('plan') },
        fakeDb,
      );

      expect(resolution.route).toEqual({
        tier: 'pro',
        primaryModelId: AI_DEFAULT_MODEL,
        fallbackModelIds: [],
        freeRouterFallback: true,
      });
    });

    it.each([
      ['the free router served it', freeModel, { freeRouterFallback: true }],
      ['GPT-6 Luna served it', `${STARTER_DEFAULT_MODEL_ID}-20261001`, {}],
    ] as const)(
      'commits Starter lesson metadata when %s',
      async (_label, servedModel, expectedFlag) => {
        mocks.resolveUserTier.mockResolvedValue('starter');
        mocks.resolveModelForTier.mockResolvedValue({
          provider: { generateModuleLessonBatch: vi.fn() },
          modelId: STARTER_DEFAULT_MODEL_ID,
          fallback: true,
        });
        mocks.invokeProvider.mockResolvedValue({
          ...providerOk(),
          metadata: {
            ...providerOk().metadata,
            provider: 'openrouter',
            model: servedModel,
          },
        });
        const taskId = createId('task');
        mocks.parseBatch.mockReturnValue(parsedBatch(taskId));

        const result = await runModuleLessonGenerationWork(
          {
            load: workLoad(taskId),
            userId: createId('user'),
            planId: createId('plan'),
            moduleId: createId('module'),
          },
          {
            serverDbClient: fakeDb,
            resolveGenerationEnabled: async () => true,
          },
        );

        expect(result.kind).toBe('success');
        const committed = mocks.commitSuccess.mock.calls[0]?.[1];
        expect(committed.metadata).toEqual({
          version: 1,
          ...expectedFlag,
        });
      },
    );
  });
});
