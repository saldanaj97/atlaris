import {
  inMemoryModelCatalogStore,
  MODEL_CATALOG_FIXTURE,
} from '../../fixtures/ai-model-catalog';
import {
  AI_DEFAULT_MODEL,
  getDefaultModelForTier,
  getFallbackModelsForTier,
  getModelsForTier,
} from '@/features/ai/ai-models';
import { FREE_ROUTER_MODEL } from '@/features/ai/model-catalog/catalog';
import { logger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureMessage: vi.fn(),
}));

const fixtureIds = (tier: keyof typeof MODEL_CATALOG_FIXTURE) =>
  MODEL_CATALOG_FIXTURE[tier].map((model) => model.modelId);

function dropFromGuardrail(
  tier: keyof typeof MODEL_CATALOG_FIXTURE,
  modelIds: readonly string[],
) {
  return inMemoryModelCatalogStore.replaceTierModels(
    tier,
    MODEL_CATALOG_FIXTURE[tier].filter(
      (model) => !modelIds.includes(model.modelId),
    ),
    new Date(),
  );
}

describe('AI Models Configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  describe('AI_DEFAULT_MODEL', () => {
    it('is the code-owned free router', () => {
      expect(AI_DEFAULT_MODEL).toBe('openrouter/free');
      expect(FREE_ROUTER_MODEL).toMatchObject({
        id: AI_DEFAULT_MODEL,
        tier: 'free',
        contextWindow: 200_000,
        inputCostPerMillion: 0,
        outputCostPerMillion: 0,
      });
      expect(FREE_ROUTER_MODEL.maxOutputTokens).toBeUndefined();
      expect(FREE_ROUTER_MODEL.description).toContain('output limits vary');
    });
  });

  describe('getModelsForTier', () => {
    it('returns only the free router for Free outline and lesson', async () => {
      for (const operation of ['initial_outline', 'lesson'] as const) {
        const ids = (await getModelsForTier('free', operation)).map(
          (m) => m.id,
        );
        expect(ids).toEqual([AI_DEFAULT_MODEL]);
      }
    });

    it('returns an empty list for Free regeneration', async () => {
      expect(await getModelsForTier('free', 'regeneration')).toEqual([]);
    });

    it('returns the Starter guardrail models for outline and regen', async () => {
      for (const operation of ['initial_outline', 'regeneration'] as const) {
        const ids = (await getModelsForTier('starter', operation)).map(
          (m) => m.id,
        );
        expect([...ids].sort()).toEqual(fixtureIds('starter').sort());
        expect(ids).not.toContain(AI_DEFAULT_MODEL);
      }
    });

    it('returns only the free router for Starter lesson', async () => {
      const ids = (await getModelsForTier('starter', 'lesson')).map(
        (m) => m.id,
      );
      expect(ids).toEqual([AI_DEFAULT_MODEL]);
    });

    it('returns the free router plus the Pro guardrail models for Pro', async () => {
      for (const operation of [
        'initial_outline',
        'regeneration',
        'lesson',
      ] as const) {
        const ids = (await getModelsForTier('pro', operation)).map((m) => m.id);
        expect(ids[0]).toBe(AI_DEFAULT_MODEL);
        expect(ids.slice(1).sort()).toEqual(fixtureIds('pro').sort());
        expect(ids).not.toContain('deepseek/deepseek-v4.1-flash');
      }
    });

    it('carries synced pricing and limits', async () => {
      const models = await getModelsForTier('starter', 'initial_outline');
      expect(
        models.find((m) => m.id === 'deepseek/deepseek-v4.1-flash'),
      ).toMatchObject({
        name: 'DeepSeek V4.1 Flash',
        provider: 'DeepSeek',
        tier: 'pro',
        contextWindow: 1_048_576,
        maxOutputTokens: 943_718,
        inputCostPerMillion: 0.07,
        outputCostPerMillion: 0.5,
      });
    });

    it('warns and keeps the list when the default falls back', async () => {
      await dropFromGuardrail('starter', ['openai/gpt-6-luna']);
      const warnSpy = vi.spyOn(logger, 'warn');

      const ids = (await getModelsForTier('starter', 'initial_outline')).map(
        (m) => m.id,
      );

      expect(ids).not.toContain('openai/gpt-6-luna');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'model_default_not_in_guardrail',
          tier: 'starter',
          defaultModelId: 'openai/gpt-6-luna',
          fallbackModelId: 'deepseek/deepseek-v4.1-flash',
        }),
        expect.any(String),
      );
    });

    it('adds the free router and alerts when every fallback left the guardrail', async () => {
      await dropFromGuardrail('starter', [
        'openai/gpt-6-luna',
        'deepseek/deepseek-v4.1-flash',
      ]);
      const errorSpy = vi.spyOn(logger, 'error');

      const ids = (await getModelsForTier('starter', 'initial_outline')).map(
        (m) => m.id,
      );

      expect(ids[0]).toBe(AI_DEFAULT_MODEL);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'model_default_not_in_guardrail',
          tier: 'starter',
          defaultModelId: 'openai/gpt-6-luna',
          fallbackModelId: AI_DEFAULT_MODEL,
        }),
        expect.any(String),
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          level: 'error',
          fingerprint: [
            'model_default_not_in_guardrail',
            'starter',
            'initial_outline',
          ],
          tags: expect.objectContaining({
            tier: 'starter',
            operation: 'initial_outline',
          }),
        }),
      );
    });

    it('does not alert when a paid fallback is still listed', async () => {
      await dropFromGuardrail('starter', ['openai/gpt-6-luna']);
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

      await getModelsForTier('starter', 'initial_outline');

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('getDefaultModelForTier', () => {
    it('returns the free router for Free outline and lesson', async () => {
      expect(await getDefaultModelForTier('free', 'initial_outline')).toBe(
        AI_DEFAULT_MODEL,
      );
      expect(await getDefaultModelForTier('free', 'lesson')).toBe(
        AI_DEFAULT_MODEL,
      );
    });

    it('returns GPT-6 Luna for Starter outline and regen', async () => {
      expect(await getDefaultModelForTier('starter', 'initial_outline')).toBe(
        'openai/gpt-6-luna',
      );
      expect(await getDefaultModelForTier('starter', 'regeneration')).toBe(
        'openai/gpt-6-luna',
      );
    });

    it('returns the free router for Starter lesson', async () => {
      expect(await getDefaultModelForTier('starter', 'lesson')).toBe(
        AI_DEFAULT_MODEL,
      );
    });

    it('returns operation-specific Pro defaults, not the cheapest synced row', async () => {
      expect(await getDefaultModelForTier('pro', 'initial_outline')).toBe(
        'openai/gpt-6.1-sol',
      );
      expect(await getDefaultModelForTier('pro', 'regeneration')).toBe(
        'anthropic/claude-sonnet-5.5',
      );
      expect(await getDefaultModelForTier('pro', 'lesson')).toBe(
        'anthropic/claude-haiku-5.5',
      );
    });

    it('uses the first listed fallback when the default left the guardrail', async () => {
      await dropFromGuardrail('starter', ['openai/gpt-6-luna']);
      await dropFromGuardrail('pro', ['anthropic/claude-sonnet-5.5']);
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

      // Starter writer route: Luna, then DeepSeek V4.1 Flash.
      expect(await getDefaultModelForTier('starter', 'initial_outline')).toBe(
        'deepseek/deepseek-v4.1-flash',
      );
      // Pro writer route: GPT-6 Sol, then GPT-6.1 Sol.
      expect(await getDefaultModelForTier('pro', 'regeneration')).toBe(
        'openai/gpt-6-sol',
      );
    });

    it('skips fallbacks the guardrail also dropped', async () => {
      await dropFromGuardrail('pro', [
        'anthropic/claude-sonnet-5.5',
        'openai/gpt-6-sol',
      ]);
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

      expect(await getDefaultModelForTier('pro', 'regeneration')).toBe(
        'openai/gpt-6.1-sol',
      );
    });

    it('falls back to the free router when every fallback left the guardrail', async () => {
      await dropFromGuardrail('starter', [
        'openai/gpt-6-luna',
        'deepseek/deepseek-v4.1-flash',
      ]);
      await dropFromGuardrail('pro', [
        'anthropic/claude-sonnet-5.5',
        'openai/gpt-6-sol',
        'openai/gpt-6.1-sol',
      ]);
      vi.spyOn(logger, 'error').mockImplementation(() => undefined);

      expect(await getDefaultModelForTier('starter', 'initial_outline')).toBe(
        AI_DEFAULT_MODEL,
      );
      expect(await getDefaultModelForTier('pro', 'regeneration')).toBe(
        AI_DEFAULT_MODEL,
      );
    });
  });

  describe('getFallbackModelsForTier', () => {
    it('never adds a paid fallback for Free outline', () => {
      expect(
        getFallbackModelsForTier(
          'free',
          'anthropic/claude-opus-5.5',
          'initial_outline',
        ),
      ).toEqual([]);
    });

    it('never falls back to openrouter/free for Starter outline/regen', () => {
      expect(
        getFallbackModelsForTier(
          'starter',
          'openai/gpt-6-luna',
          'initial_outline',
        ),
      ).toEqual([]);
      expect(
        getFallbackModelsForTier(
          'starter',
          'deepseek/deepseek-v4.1-flash',
          'regeneration',
        ),
      ).toEqual([]);
    });

    it('uses openrouter/free as the only Starter/Free lesson fallback', () => {
      expect(
        getFallbackModelsForTier('starter', 'openai/gpt-6-luna', 'lesson'),
      ).toEqual([AI_DEFAULT_MODEL]);
      expect(
        getFallbackModelsForTier('free', AI_DEFAULT_MODEL, 'lesson'),
      ).toEqual([]);
    });

    it('does not add provider fallbacks for Pro', () => {
      expect(
        getFallbackModelsForTier(
          'pro',
          'anthropic/claude-sonnet-5.5',
          'initial_outline',
        ),
      ).toEqual([]);
    });
  });
});
