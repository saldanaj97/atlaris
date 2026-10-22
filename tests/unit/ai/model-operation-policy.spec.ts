import type { SubscriptionTier } from '@/shared/types/billing.types';

import { getModelById } from '@/features/ai/ai-models';
import {
  type ModelOperation,
  getModelOperationPolicy,
  MODEL_OPERATIONS,
  PRO_MODEL_IDS,
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
  'openai/gpt-6-luna',
  'anthropic/claude-haiku-5.5',
  'deepseek/deepseek-v4.1-flash',
  'openai/gpt-6.1-sol',
  'openai/gpt-6-sol',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-opus-5.5',
] as const;

const PRO_ONLY_MODEL_ID = 'anthropic/claude-opus-5.5';
const STARTER_ONLY_MODEL_ID = 'deepseek/deepseek-v4.1-flash';

describe('model-operation-policy', () => {
  it('keeps every contract model id in AVAILABLE_MODELS', () => {
    for (const modelId of CONTRACT_MODEL_IDS) {
      expect(getModelById(modelId)?.id).toBe(modelId);
    }
  });

  it('does not treat a paid model as a Free catalog model', () => {
    expect(getModelById(PRO_ONLY_MODEL_ID)?.tier).toBe('pro');
    expect(
      getModelById(PRO_ONLY_MODEL_ID)?.inputCostPerMillion,
    ).toBeGreaterThan(0);
  });

  describe('tier × operation matrix', () => {
    it.each<{
      tier: SubscriptionTier;
      operation: ModelOperation;
      allowed: boolean;
      defaultModelId: string;
      expectedIds: readonly string[];
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
        defaultModelId: 'openai/gpt-6.1-sol',
        expectedIds: PRO_MODEL_IDS,
      },
      {
        tier: 'pro',
        operation: 'regeneration',
        allowed: true,
        defaultModelId: 'anthropic/claude-sonnet-5.5',
        expectedIds: PRO_MODEL_IDS,
      },
      {
        tier: 'pro',
        operation: 'lesson',
        allowed: true,
        defaultModelId: 'anthropic/claude-haiku-5.5',
        expectedIds: PRO_MODEL_IDS,
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
      const ids = getModelOperationPolicy('free', operation).modelIds;
      expect(ids).toEqual([AI_DEFAULT_MODEL]);
      expect(ids).not.toContain('openai/gpt-6.1-sol');
      expect(ids).not.toContain(STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID);
    }
  });

  it('Starter outline/regen catalogs are exactly the three allowlisted ids', () => {
    expect([...STARTER_OUTLINE_REGENERATION_MODEL_IDS]).toEqual([
      'openai/gpt-6-luna',
      'anthropic/claude-haiku-5.5',
      'deepseek/deepseek-v4.1-flash',
    ]);
    expect(STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID).toBe(
      'openai/gpt-6-luna',
    );

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

    expect(outline.defaultModelId).toBe('openai/gpt-6.1-sol');
    expect(regeneration.defaultModelId).toBe('anthropic/claude-sonnet-5.5');
    expect(lesson.defaultModelId).toBe('anthropic/claude-haiku-5.5');
    expect(
      new Set([
        outline.defaultModelId,
        regeneration.defaultModelId,
        lesson.defaultModelId,
      ]).size,
    ).toBe(3);
  });

  it.each(TIERS)('%s catalogs only include Claude Opus on Pro', (tier) => {
    if (tier === 'pro') {
      expect(
        getModelOperationPolicy(tier, 'initial_outline').modelIds,
      ).toContain(PRO_ONLY_MODEL_ID);
      return;
    }

    for (const operation of MODEL_OPERATIONS) {
      expect(getModelOperationPolicy(tier, operation).modelIds).not.toContain(
        PRO_ONLY_MODEL_ID,
      );
    }
  });

  it('keeps DeepSeek out of every Pro catalog', () => {
    expect(getModelById(STARTER_ONLY_MODEL_ID)?.id).toBe(STARTER_ONLY_MODEL_ID);
    expect(PRO_MODEL_IDS).not.toContain(STARTER_ONLY_MODEL_ID);
    for (const operation of MODEL_OPERATIONS) {
      expect(getModelOperationPolicy('pro', operation).modelIds).not.toContain(
        STARTER_ONLY_MODEL_ID,
      );
    }
  });

  it('references only catalog models in Pro policies', () => {
    for (const modelId of PRO_MODEL_IDS) {
      expect(getModelById(modelId)?.id).toBe(modelId);
    }
  });
});
