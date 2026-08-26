/**
 * Code-owned model catalogs and defaults per billing tier × generation
 * operation. Membership is not an env/DB control plane. Catalog `tier`
 * labels are not proof of zero cost.
 */

import type { SubscriptionTier } from '@/shared/types/billing.types';

import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

export const MODEL_OPERATIONS = [
  'initial_outline',
  'regeneration',
  'lesson',
] as const;

export type ModelOperation = (typeof MODEL_OPERATIONS)[number];

export const STARTER_OUTLINE_REGENERATION_MODEL_IDS = [
  'google/gemini-2.5-flash-lite',
  'openai/gpt-4o-mini-2024-07-18',
  'google/gemini-3-flash-preview',
] as const;

export const STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID =
  STARTER_OUTLINE_REGENERATION_MODEL_IDS[0];

const PRO_DEFAULT_MODEL_BY_OPERATION = {
  initial_outline: 'openai/gpt-5.2',
  regeneration: 'google/gemini-3-pro-preview',
  lesson: 'google/gemini-3-flash-preview',
} as const satisfies Record<ModelOperation, string>;

export type ModelOperationPolicy = {
  readonly allowed: boolean;
  readonly defaultModelId: string;
  /** `'full'` is the Pro registry. Empty when the operation is not a catalog. */
  readonly modelIds: readonly string[] | 'full';
};

function freePolicy(operation: ModelOperation): ModelOperationPolicy {
  switch (operation) {
    case 'initial_outline':
    case 'lesson':
      return {
        allowed: true,
        defaultModelId: AI_DEFAULT_MODEL,
        modelIds: [AI_DEFAULT_MODEL],
      };
    case 'regeneration':
      return {
        allowed: false,
        defaultModelId: AI_DEFAULT_MODEL,
        modelIds: [],
      };
    default: {
      const _never: never = operation;
      throw new Error(`Unhandled model operation: ${String(_never)}`);
    }
  }
}

function starterPolicy(operation: ModelOperation): ModelOperationPolicy {
  switch (operation) {
    case 'initial_outline':
    case 'regeneration':
      return {
        allowed: true,
        defaultModelId: STARTER_OUTLINE_REGENERATION_DEFAULT_MODEL_ID,
        modelIds: STARTER_OUTLINE_REGENERATION_MODEL_IDS,
      };
    case 'lesson':
      return {
        allowed: true,
        defaultModelId: AI_DEFAULT_MODEL,
        modelIds: [AI_DEFAULT_MODEL],
      };
    default: {
      const _never: never = operation;
      throw new Error(`Unhandled model operation: ${String(_never)}`);
    }
  }
}

function proPolicy(operation: ModelOperation): ModelOperationPolicy {
  switch (operation) {
    case 'initial_outline':
    case 'regeneration':
    case 'lesson':
      return {
        allowed: true,
        defaultModelId: PRO_DEFAULT_MODEL_BY_OPERATION[operation],
        modelIds: 'full',
      };
    default: {
      const _never: never = operation;
      throw new Error(`Unhandled model operation: ${String(_never)}`);
    }
  }
}

export function getModelOperationPolicy(
  tier: SubscriptionTier,
  operation: ModelOperation,
): ModelOperationPolicy {
  switch (tier) {
    case 'free':
      return freePolicy(operation);
    case 'starter':
      return starterPolicy(operation);
    case 'pro':
      return proPolicy(operation);
    default: {
      const _never: never = tier;
      throw new Error(`Unhandled subscription tier: ${String(_never)}`);
    }
  }
}
