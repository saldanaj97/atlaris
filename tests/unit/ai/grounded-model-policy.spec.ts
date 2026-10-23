import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  FREE_GROUNDED_WRITER_MODEL_IDS,
  getGroundedModelRoute,
  getGroundedOperationPolicy,
  getModelOperationPolicy,
  GROUNDED_OPERATIONS,
  GROUNDED_PRESET_BY_OPERATION,
  GROUNDED_PRESET_SLUGS,
  type GroundedOperation,
  hasGroundedRegenerationQuota,
  PRO_GROUNDED_REVIEW_CATALOG,
  PRO_GROUNDED_WRITER_CATALOG,
  STARTER_DEFAULT_MODEL_ID,
} from '@/features/ai/model-operation-policy';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import { describe, expect, it } from 'vitest';

const TIERS = [
  'free',
  'starter',
  'pro',
] as const satisfies readonly SubscriptionTier[];

const WRITER_OPERATIONS = [
  'initial_outline',
  'regeneration',
  'lesson',
] as const satisfies readonly GroundedOperation[];

const REVIEW_OPERATIONS = [
  'outline_verify',
  'lesson_verify',
  'advisor',
] as const satisfies readonly GroundedOperation[];

function modelIds(tier: SubscriptionTier, operation: GroundedOperation) {
  return getGroundedModelRoute(tier, operation)?.map((m) => m.modelId);
}

describe('getGroundedOperationPolicy', () => {
  it.each(REVIEW_OPERATIONS)('does not run %s on free', (operation) => {
    expect(getGroundedOperationPolicy('free', operation)).toEqual({
      allowed: false,
    });
    expect(getGroundedModelRoute('free', operation)).toBeNull();
  });

  it.each(WRITER_OPERATIONS)(
    'writes %s on free with the ordered allowlist, never openrouter/free',
    (operation) => {
      expect(modelIds('free', operation)).toEqual([
        ...FREE_GROUNDED_WRITER_MODEL_IDS,
      ]);
      expect(modelIds('free', operation)).not.toContain(AI_DEFAULT_MODEL);
    },
  );

  it('resolves research per tier with its search mode and limits', () => {
    expect(getGroundedOperationPolicy('free', 'research')).toMatchObject({
      models: [
        { modelId: 'nvidia/nemotron-3.5-lightning:free', researchMode: 'fast' },
        { modelId: 'nvidia/nemotron-3.5-super-vl:free' },
      ],
      research: { maxResults: 3, maxTotalResults: 6 },
    });
    expect(getGroundedOperationPolicy('starter', 'research')).toMatchObject({
      models: [
        { modelId: 'anthropic/claude-haiku-5.5', researchMode: 'fast' },
        { modelId: 'openai/gpt-6-luna' },
      ],
      research: { maxResults: 5, maxTotalResults: 15 },
    });
    expect(getGroundedOperationPolicy('pro', 'research')).toMatchObject({
      models: [
        { modelId: 'openai/gpt-6-sol', researchMode: 'advanced' },
        { modelId: 'anthropic/claude-haiku-5.5', researchMode: 'fast' },
      ],
      research: { maxResults: 8, maxTotalResults: 24 },
    });
  });

  it('sets research limits on research only', () => {
    for (const tier of TIERS) {
      for (const operation of GROUNDED_OPERATIONS) {
        const policy = getGroundedOperationPolicy(tier, operation);
        if (operation === 'research' || !policy.allowed) continue;
        expect(policy.research).toBeUndefined();
      }
    }
  });

  it('resolves starter roles as code-owned routes', () => {
    expect(modelIds('starter', 'initial_outline')).toEqual([
      'openai/gpt-6-luna',
      'deepseek/deepseek-v4.1-flash',
    ]);
    expect(modelIds('starter', 'outline_verify')).toEqual([
      'openai/gpt-6.1-sol',
      'anthropic/claude-haiku-5.5',
    ]);
    expect(modelIds('starter', 'advisor')).toEqual([
      'openai/gpt-6.1-sol',
      'anthropic/claude-haiku-5.5',
    ]);
    for (const operation of GROUNDED_OPERATIONS) {
      expect(getGroundedOperationPolicy('starter', operation)).toMatchObject({
        catalog: [],
      });
    }
  });

  it('resolves pro defaults and a catalog per role', () => {
    expect(modelIds('pro', 'lesson')).toEqual([
      'openai/gpt-6-sol',
      'openai/gpt-6.1-sol',
    ]);
    expect(modelIds('pro', 'lesson_verify')).toEqual([
      'anthropic/claude-sonnet-5.5',
      'openai/gpt-6.1-sol',
    ]);
    expect(modelIds('pro', 'advisor')).toEqual([
      'anthropic/claude-opus-5.5',
      'anthropic/claude-sonnet-5.5',
    ]);
    expect(getGroundedOperationPolicy('pro', 'research')).toMatchObject({
      catalog: [],
    });
    for (const operation of WRITER_OPERATIONS) {
      expect(getGroundedOperationPolicy('pro', operation)).toMatchObject({
        catalog: PRO_GROUNDED_WRITER_CATALOG,
      });
    }
    for (const operation of REVIEW_OPERATIONS) {
      expect(getGroundedOperationPolicy('pro', operation)).toMatchObject({
        catalog: PRO_GROUNDED_REVIEW_CATALOG,
      });
    }
  });

  it('never defaults any grounded role to a Gemini model', () => {
    for (const tier of TIERS) {
      for (const operation of GROUNDED_OPERATIONS) {
        expect(
          (modelIds(tier, operation) ?? []).filter((id) =>
            id.startsWith('google/'),
          ),
        ).toEqual([]);
      }
    }
  });
});

describe('getGroundedModelRoute', () => {
  it('puts a Pro catalog pick first, then the default route without it', () => {
    expect(
      getGroundedModelRoute('pro', 'initial_outline', 'openai/gpt-6.1-sol'),
    ).toEqual([
      { modelId: 'openai/gpt-6.1-sol' },
      { modelId: 'openai/gpt-6-sol' },
    ]);
    expect(
      getGroundedModelRoute(
        'pro',
        'outline_verify',
        'anthropic/claude-opus-5.5',
      ),
    ).toEqual([
      { modelId: 'anthropic/claude-opus-5.5' },
      { modelId: 'anthropic/claude-sonnet-5.5' },
      { modelId: 'openai/gpt-6.1-sol' },
    ]);
  });

  it('ignores a pick outside the role catalog', () => {
    // The advisor-only Opus is not a writer choice.
    expect(
      getGroundedModelRoute('pro', 'lesson', 'anthropic/claude-opus-5.5'),
    ).toEqual(getGroundedModelRoute('pro', 'lesson'));
    expect(
      getGroundedModelRoute('pro', 'research', 'openai/gpt-6.1-sol'),
    ).toEqual(getGroundedModelRoute('pro', 'research'));
  });

  it('ignores picks on code-owned tiers', () => {
    expect(
      getGroundedModelRoute('starter', 'lesson', 'openai/gpt-6-sol'),
    ).toEqual(getGroundedModelRoute('starter', 'lesson'));
    expect(
      getGroundedModelRoute(
        'free',
        'lesson',
        'minimax/minimax-m3.1-flash:free',
      ),
    ).toEqual(getGroundedModelRoute('free', 'lesson'));
  });
});

describe('hasGroundedRegenerationQuota', () => {
  it('allows one grounded regeneration per plan on free', () => {
    expect(getGroundedOperationPolicy('free', 'regeneration')).toMatchObject({
      quotaPerPlan: 1,
    });
    expect(hasGroundedRegenerationQuota('free', 0)).toBe(true);
    expect(hasGroundedRegenerationQuota('free', 1)).toBe(false);
    expect(hasGroundedRegenerationQuota('free', 2)).toBe(false);
  });

  it.each(['starter', 'pro'] as const)('sets no per-plan cap on %s', (tier) => {
    expect(hasGroundedRegenerationQuota(tier, 25)).toBe(true);
  });

  it('caps only regeneration', () => {
    for (const operation of GROUNDED_OPERATIONS) {
      if (operation === 'regeneration') continue;
      expect(getGroundedOperationPolicy('free', operation)).not.toMatchObject({
        quotaPerPlan: 1,
      });
    }
  });
});

describe('GROUNDED_PRESET_BY_OPERATION', () => {
  it('adds three valid preset slugs', () => {
    expect(Object.values(GROUNDED_PRESET_SLUGS)).toEqual([
      'atlaris-grounded-research',
      'atlaris-grounded-verifier',
      'atlaris-grounded-repair',
    ]);
    for (const slug of Object.values(GROUNDED_PRESET_SLUGS)) {
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('keeps the existing plan and lesson presets for writers', () => {
    expect(GROUNDED_PRESET_BY_OPERATION).toEqual({
      research: { slug: 'atlaris-grounded-research' },
      initial_outline: { existing: 'plan' },
      regeneration: { existing: 'plan' },
      lesson: { existing: 'lesson' },
      outline_verify: { slug: 'atlaris-grounded-verifier' },
      lesson_verify: { slug: 'atlaris-grounded-verifier' },
      advisor: { slug: 'atlaris-grounded-repair' },
    });
  });
});

describe('legacy policy with grounded generation off', () => {
  it('keeps the legacy free and starter lesson models', () => {
    expect(getModelOperationPolicy('free', 'lesson').defaultModelId).toBe(
      AI_DEFAULT_MODEL,
    );
    expect(getModelOperationPolicy('free', 'regeneration').allowed).toBe(false);
    expect(getModelOperationPolicy('starter', 'lesson').defaultModelId).toBe(
      STARTER_DEFAULT_MODEL_ID,
    );
  });
});
