import type { SubscriptionTier } from '@/shared/types/billing.types';

import { AVAILABLE_MODELS, getModelById } from '@/features/ai/ai-models';
import {
  type ModelOperation,
  type ModelOperationPolicy,
  getModelOperationPolicy,
  MODEL_OPERATIONS,
  STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID,
  STARTER_OUTLINE_REGENERATION_MODEL_IDS,
} from '@/features/ai/model-operation-policy';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import { describe, expect, it } from 'vitest';

const TIERS = [
  'free',
  'starter',
  'pro',
] as const satisfies readonly SubscriptionTier[];

const CONTRACT_MODEL_IDS = [
  AI_DEFAULT_MODEL,
  'google/gemini-2.5-flash-lite',
  'openai/gpt-4o-mini-2024-07-18',
  'google/gemini-3-flash-preview',
  'openai/gpt-5.2',
  'google/gemini-3-pro-preview',
] as const;

const HAIKU_MODEL_ID = 'anthropic/claude-haiku-4.5';

function catalogIds(policy: ModelOperationPolicy): readonly string[] {
  return policy.modelIds === 'full'
    ? AVAILABLE_MODELS.map((model) => model.id)
    : policy.modelIds;
}

describe('model-operation-policy', () => {
  it('keeps every contract model id in AVAILABLE_MODELS', () => {
    for (const modelId of CONTRACT_MODEL_IDS) {
      expect(getModelById(modelId)?.id).toBe(modelId);
    }
  });

  it('does not treat Claude Haiku as a Free catalog model', () => {
    expect(getModelById(HAIKU_MODEL_ID)?.tier).toBe('pro');
    expect(getModelById(HAIKU_MODEL_ID)?.inputCostPerMillion).toBeGreaterThan(
      0,
    );
  });

  describe('tier × operation matrix', () => {
    it.each<{
      tier: SubscriptionTier;
      operation: ModelOperation;
      allowed: boolean;
      defaultModelId: string;
      expectedIds: readonly string[] | 'full';
    }>([
      {
        tier: 'free',
        operation: 'initial_outline',
        allowed: true,
        defaultModelId: AI_DEFAULT_MODEL,
        expectedIds: [AI_DEFAULT_MODEL],
      },
      {
        tier: 'free',
        operation: 'regeneration',
        allowed: false,
        defaultModelId: AI_DEFAULT_MODEL,
        expectedIds: [],
      },
      {
        tier: 'free',
        operation: 'lesson',
        allowed: true,
        defaultModelId: AI_DEFAULT_MODEL,
        expectedIds: [AI_DEFAULT_MODEL],
      },
      {
        tier: 'starter',
        operation: 'initial_outline',
        allowed: true,
        defaultModelId: STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID,
        expectedIds: STARTER_OUTLINE_REGENERATION_MODEL_IDS,
      },
      {
        tier: 'starter',
        operation: 'regeneration',
        allowed: true,
        defaultModelId: STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID,
        expectedIds: STARTER_OUTLINE_REGENERATION_MODEL_IDS,
      },
      {
        tier: 'starter',
        operation: 'lesson',
        allowed: true,
        defaultModelId: AI_DEFAULT_MODEL,
        expectedIds: [AI_DEFAULT_MODEL],
      },
      {
        tier: 'pro',
        operation: 'initial_outline',
        allowed: true,
        defaultModelId: 'openai/gpt-5.2',
        expectedIds: 'full',
      },
      {
        tier: 'pro',
        operation: 'regeneration',
        allowed: true,
        defaultModelId: 'google/gemini-3-pro-preview',
        expectedIds: 'full',
      },
      {
        tier: 'pro',
        operation: 'lesson',
        allowed: true,
        defaultModelId: 'google/gemini-3-flash-preview',
        expectedIds: 'full',
      },
    ])(
      '$tier $operation → allowed=$allowed default=$defaultModelId',
      ({ tier, operation, allowed, defaultModelId, expectedIds }) => {
        const policy = getModelOperationPolicy(tier, operation);
        expect(policy.allowed).toBe(allowed);
        expect(policy.defaultModelId).toBe(defaultModelId);
        expect(policy.modelIds).toEqual(expectedIds);
      },
    );

    it('covers every billing tier and model operation exactly once', () => {
      const combinations = TIERS.flatMap((tier) =>
        MODEL_OPERATIONS.map((operation) => `${tier}:${operation}`),
      );
      expect(combinations).toHaveLength(9);
    });
  });

  it('Free outline and lesson ignore paid override ids', () => {
    for (const operation of ['initial_outline', 'lesson'] as const) {
      const ids = catalogIds(getModelOperationPolicy('free', operation));
      expect(ids).toEqual([AI_DEFAULT_MODEL]);
      expect(ids).not.toContain('openai/gpt-5.2');
      expect(ids).not.toContain(STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID);
    }
  });

  it('Starter outline/regen catalogs are exactly the three allowlisted ids', () => {
    expect([...STARTER_OUTLINE_REGENERATION_MODEL_IDS]).toEqual([
      'google/gemini-2.5-flash-lite',
      'openai/gpt-4o-mini-2024-07-18',
      'google/gemini-3-flash-preview',
    ]);

    for (const operation of ['initial_outline', 'regeneration'] as const) {
      expect(getModelOperationPolicy('starter', operation).modelIds).toEqual(
        STARTER_OUTLINE_REGENERATION_MODEL_IDS,
      );
    }
  });

  it('Starter lesson is the free router, not the outline allowlist', () => {
    const policy = getModelOperationPolicy('starter', 'lesson');
    expect(policy.modelIds).toEqual([AI_DEFAULT_MODEL]);
    expect(policy.modelIds).not.toEqual(STARTER_OUTLINE_REGENERATION_MODEL_IDS);
  });

  it('Pro operation defaults are independent', () => {
    const outline = getModelOperationPolicy('pro', 'initial_outline');
    const regeneration = getModelOperationPolicy('pro', 'regeneration');
    const lesson = getModelOperationPolicy('pro', 'lesson');

    expect(outline.defaultModelId).toBe('openai/gpt-5.2');
    expect(regeneration.defaultModelId).toBe('google/gemini-3-pro-preview');
    expect(lesson.defaultModelId).toBe('google/gemini-3-flash-preview');
    expect(
      new Set([
        outline.defaultModelId,
        regeneration.defaultModelId,
        lesson.defaultModelId,
      ]).size,
    ).toBe(3);
  });

  it.each(TIERS)(
    '%s catalogs never include Claude Haiku on Free or Starter',
    (tier) => {
      if (tier === 'pro') {
        expect(
          catalogIds(getModelOperationPolicy(tier, 'initial_outline')),
        ).toContain(HAIKU_MODEL_ID);
        return;
      }

      for (const operation of MODEL_OPERATIONS) {
        expect(
          catalogIds(getModelOperationPolicy(tier, operation)),
        ).not.toContain(HAIKU_MODEL_ID);
      }
    },
  );
});
