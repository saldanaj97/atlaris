import type { SubscriptionTier } from '@/shared/types/billing.types';

import { MODEL_CATALOG_FIXTURE } from '../../fixtures/ai-model-catalog';
import {
  type ModelOperation,
  type ModelOperationPolicy,
  getModelOperationPolicy,
  MODEL_OPERATIONS,
  STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID,
} from '@/features/ai/model-operation-policy';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import { describe, expect, it } from 'vitest';

const TIERS = [
  'free',
  'starter',
  'pro',
] as const satisfies readonly SubscriptionTier[];

describe('model-operation-policy', () => {
  describe('tier × operation matrix', () => {
    it.each<
      {
        tier: SubscriptionTier;
        operation: ModelOperation;
      } & ModelOperationPolicy
    >([
      {
        tier: 'free',
        operation: 'initial_outline',
        allowed: true,
        defaultModelId: AI_DEFAULT_MODEL,
        usesTierCatalog: false,
        usesFreeRouter: true,
      },
      {
        tier: 'free',
        operation: 'regeneration',
        allowed: false,
        defaultModelId: AI_DEFAULT_MODEL,
        usesTierCatalog: false,
        usesFreeRouter: false,
      },
      {
        tier: 'free',
        operation: 'lesson',
        allowed: true,
        defaultModelId: AI_DEFAULT_MODEL,
        usesTierCatalog: false,
        usesFreeRouter: true,
      },
      {
        tier: 'starter',
        operation: 'initial_outline',
        allowed: true,
        defaultModelId: STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID,
        usesTierCatalog: true,
        usesFreeRouter: false,
      },
      {
        tier: 'starter',
        operation: 'regeneration',
        allowed: true,
        defaultModelId: STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID,
        usesTierCatalog: true,
        usesFreeRouter: false,
      },
      {
        tier: 'starter',
        operation: 'lesson',
        allowed: true,
        defaultModelId: AI_DEFAULT_MODEL,
        usesTierCatalog: false,
        usesFreeRouter: true,
      },
      {
        tier: 'pro',
        operation: 'initial_outline',
        allowed: true,
        defaultModelId: 'openai/gpt-6.1-sol',
        usesTierCatalog: true,
        usesFreeRouter: true,
      },
      {
        tier: 'pro',
        operation: 'regeneration',
        allowed: true,
        defaultModelId: 'anthropic/claude-sonnet-5.5',
        usesTierCatalog: true,
        usesFreeRouter: true,
      },
      {
        tier: 'pro',
        operation: 'lesson',
        allowed: true,
        defaultModelId: 'anthropic/claude-haiku-5.5',
        usesTierCatalog: true,
        usesFreeRouter: true,
      },
    ])(
      '$tier $operation → allowed=$allowed default=$defaultModelId',
      ({ tier, operation, ...expected }) => {
        expect(getModelOperationPolicy(tier, operation)).toEqual(expected);
      },
    );

    it('covers every billing tier and model operation exactly once', () => {
      const combinations = TIERS.flatMap((tier) =>
        MODEL_OPERATIONS.map((operation) => `${tier}:${operation}`),
      );
      expect(combinations).toHaveLength(9);
    });
  });

  it('keeps the Starter outline/regen default on GPT-6 Luna', () => {
    expect(STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID).toBe(
      'openai/gpt-6-luna',
    );
  });

  it('Pro operation defaults are independent', () => {
    const defaults = MODEL_OPERATIONS.map(
      (operation) => getModelOperationPolicy('pro', operation).defaultModelId,
    );
    expect(new Set(defaults).size).toBe(3);
  });

  it('every guardrail-sourced default is in its tier fixture', () => {
    for (const tier of TIERS) {
      for (const operation of MODEL_OPERATIONS) {
        const policy = getModelOperationPolicy(tier, operation);
        if (!policy.allowed || !policy.usesTierCatalog) {
          continue;
        }
        if (
          policy.usesFreeRouter &&
          policy.defaultModelId === AI_DEFAULT_MODEL
        ) {
          continue;
        }
        expect(
          MODEL_CATALOG_FIXTURE[tier].map((model) => model.modelId),
        ).toContain(policy.defaultModelId);
      }
    }
  });
});
