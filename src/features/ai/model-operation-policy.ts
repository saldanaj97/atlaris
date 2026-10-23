/**
 * Model sources and code-owned defaults per billing tier × generation
 * operation. The selectable models come from each tier's OpenRouter guardrail
 * (`model-catalog`); this file decides which sources an operation uses and
 * which model it runs when the user picked none.
 */

import type { SubscriptionTier } from '@/shared/types/billing.types';

import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

export const MODEL_OPERATIONS = [
  'initial_outline',
  'regeneration',
  'lesson',
] as const;

export type ModelOperation = (typeof MODEL_OPERATIONS)[number];

/**
 * Starter's default for every operation. Lessons fall back to
 * `openrouter/free` when it fails (`getFallbackModelsForTier`).
 */
export const STARTER_DEFAULT_MODEL_ID = 'openai/gpt-6-luna';

const PRO_DEFAULT_MODEL_BY_OPERATION = {
  initial_outline: 'openai/gpt-6.1-sol',
  regeneration: 'anthropic/claude-sonnet-5.5',
  lesson: 'anthropic/claude-haiku-5.5',
} as const satisfies Record<ModelOperation, string>;

/**
 * Guardrail models a tier keeps only for its grounded roles: left out of the
 * tier's selectable models, defaults and fallbacks. Starter keeps GPT-6.1 Sol
 * for its verifier and advisor, but it costs too much for Starter outlines.
 */
export const PICKER_HIDDEN_MODEL_IDS_BY_TIER = {
  free: [],
  starter: ['openai/gpt-6.1-sol'],
  pro: [],
} as const satisfies Record<SubscriptionTier, readonly string[]>;

export type ModelOperationPolicy = {
  readonly allowed: boolean;
  /**
   * Should be in the operation's models. When the guardrail drops it,
   * resolution uses the first listed model on the operation's grounded writer
   * route, then the free router.
   */
  readonly defaultModelId: string;
  /** Offers the tier's synced guardrail models. */
  readonly usesTierCatalog: boolean;
  /** Offers the code-owned `openrouter/free` router. */
  readonly usesFreeRouter: boolean;
};

const FREE_ROUTER_ONLY: ModelOperationPolicy = {
  allowed: true,
  defaultModelId: AI_DEFAULT_MODEL,
  usesTierCatalog: false,
  usesFreeRouter: true,
};

function freePolicy(operation: ModelOperation): ModelOperationPolicy {
  switch (operation) {
    case 'initial_outline':
    case 'lesson':
      return FREE_ROUTER_ONLY;
    case 'regeneration':
      return {
        allowed: false,
        defaultModelId: AI_DEFAULT_MODEL,
        usesTierCatalog: false,
        usesFreeRouter: false,
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
    case 'lesson':
      return {
        allowed: true,
        defaultModelId: STARTER_DEFAULT_MODEL_ID,
        usesTierCatalog: true,
        usesFreeRouter: false,
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
        usesTierCatalog: true,
        usesFreeRouter: true,
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

/*
 * Grounded generation (JCS-154). A separate policy so the legacy one above,
 * and the pipeline it drives, stay unchanged while the `grounded-generation`
 * flag is off. Model IDs are OpenRouter slugs sent per request; presets hold
 * only prompts and stay model-agnostic.
 */

export const GROUNDED_OPERATIONS = [
  'research',
  'initial_outline',
  'regeneration',
  'lesson',
  'outline_verify',
  'lesson_verify',
  'advisor',
] as const;

export type GroundedOperation = (typeof GROUNDED_OPERATIONS)[number];

/** OpenRouter web search depth for a research model. */
export type ResearchMode = 'fast' | 'advanced';

export type GroundedModelChoice = {
  readonly modelId: string;
  /** Set on research models only. */
  readonly researchMode?: ResearchMode;
};

/** Per-request web search caps (`max_results`, `max_total_results`). */
export type ResearchLimits = {
  readonly maxResults: number;
  readonly maxTotalResults: number;
};

export type GroundedOperationPolicy =
  | { readonly allowed: false }
  | {
      readonly allowed: true;
      /** Primary first, then fallbacks in order. */
      readonly models: readonly [GroundedModelChoice, ...GroundedModelChoice[]];
      /** Pro models a user may pick; empty means code-owned. */
      readonly catalog: readonly string[];
      /** Runs allowed per plan; `null` means this policy sets no cap. */
      readonly quotaPerPlan: number | null;
      /** Set on `research` only. */
      readonly research?: ResearchLimits;
    };

/** OpenRouter presets added for grounded generation. */
export const GROUNDED_PRESET_SLUGS = {
  research: 'atlaris-grounded-research',
  verifier: 'atlaris-grounded-verifier',
  repair: 'atlaris-grounded-repair',
} as const;

export type GroundedPreset =
  | { readonly slug: string }
  /** The existing `openRouterEnv.planPreset` or `lessonPreset`. */
  | { readonly existing: 'plan' | 'lesson' };

/**
 * OpenRouter preset per operation. The advisor's instructions go in its tool
 * parameters on the repair request, which uses the repair preset.
 */
export const GROUNDED_PRESET_BY_OPERATION = {
  research: { slug: GROUNDED_PRESET_SLUGS.research },
  initial_outline: { existing: 'plan' },
  regeneration: { existing: 'plan' },
  lesson: { existing: 'lesson' },
  outline_verify: { slug: GROUNDED_PRESET_SLUGS.verifier },
  lesson_verify: { slug: GROUNDED_PRESET_SLUGS.verifier },
  advisor: { slug: GROUNDED_PRESET_SLUGS.repair },
} as const satisfies Record<GroundedOperation, GroundedPreset>;

/** Free writer models, tried in this order. Replaces `openrouter/free`. */
export const FREE_GROUNDED_WRITER_MODEL_IDS = [
  'nvidia/nemotron-3.5-super-vl:free',
  'nvidia/nemotron-3.5-lightning:free',
  'minimax/minimax-m3.1-flash:free',
  'dots-studio/dots-3-note-preview:free',
] as const;

/** Free tier: one grounded regeneration per plan. */
export const FREE_GROUNDED_REGENERATION_QUOTA_PER_PLAN = 1;

export const PRO_GROUNDED_WRITER_CATALOG = [
  'openai/gpt-6-sol',
  'openai/gpt-6.1-sol',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-haiku-5.5',
  'openai/gpt-6-luna',
] as const;

/** Shared by the verifier and advisor roles. */
export const PRO_GROUNDED_REVIEW_CATALOG = [
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-opus-5.5',
  'openai/gpt-6.1-sol',
  'openai/gpt-6-sol',
  'anthropic/claude-haiku-5.5',
] as const;

const RESEARCH_LIMITS_BY_TIER = {
  free: { maxResults: 3, maxTotalResults: 6 },
  starter: { maxResults: 5, maxTotalResults: 15 },
  pro: { maxResults: 8, maxTotalResults: 24 },
} as const satisfies Record<SubscriptionTier, ResearchLimits>;

type GroundedRole = 'research' | 'writer' | 'verifier' | 'advisor';

function groundedRole(operation: GroundedOperation): GroundedRole {
  switch (operation) {
    case 'research':
      return 'research';
    case 'initial_outline':
    case 'regeneration':
    case 'lesson':
      return 'writer';
    case 'outline_verify':
    case 'lesson_verify':
      return 'verifier';
    case 'advisor':
      return 'advisor';
    default: {
      const _never: never = operation;
      throw new Error(`Unhandled grounded operation: ${String(_never)}`);
    }
  }
}

type RoleModels = readonly [GroundedModelChoice, ...GroundedModelChoice[]];

const GROUNDED_MODELS_BY_TIER = {
  free: {
    research: [
      {
        modelId: 'nvidia/nemotron-3.5-lightning:free',
        researchMode: 'fast',
      },
      {
        modelId: 'nvidia/nemotron-3.5-super-vl:free',
        researchMode: 'fast',
      },
    ],
    writer: [
      { modelId: FREE_GROUNDED_WRITER_MODEL_IDS[0] },
      { modelId: FREE_GROUNDED_WRITER_MODEL_IDS[1] },
      { modelId: FREE_GROUNDED_WRITER_MODEL_IDS[2] },
      { modelId: FREE_GROUNDED_WRITER_MODEL_IDS[3] },
    ],
    verifier: null,
    advisor: null,
  },
  starter: {
    research: [
      { modelId: 'anthropic/claude-haiku-5.5', researchMode: 'fast' },
      { modelId: 'openai/gpt-6-luna', researchMode: 'fast' },
    ],
    writer: [
      { modelId: 'openai/gpt-6-luna' },
      { modelId: 'deepseek/deepseek-v4.1-flash' },
    ],
    verifier: [
      { modelId: 'openai/gpt-6.1-sol' },
      { modelId: 'anthropic/claude-haiku-5.5' },
    ],
    advisor: [
      { modelId: 'openai/gpt-6.1-sol' },
      { modelId: 'anthropic/claude-haiku-5.5' },
    ],
  },
  pro: {
    research: [
      { modelId: 'openai/gpt-6-sol', researchMode: 'advanced' },
      { modelId: 'anthropic/claude-haiku-5.5', researchMode: 'fast' },
    ],
    writer: [
      { modelId: 'openai/gpt-6-sol' },
      { modelId: 'openai/gpt-6.1-sol' },
    ],
    verifier: [
      { modelId: 'anthropic/claude-sonnet-5.5' },
      { modelId: 'openai/gpt-6.1-sol' },
    ],
    advisor: [
      { modelId: 'anthropic/claude-opus-5.5' },
      { modelId: 'anthropic/claude-sonnet-5.5' },
    ],
  },
} as const satisfies Record<
  SubscriptionTier,
  Record<GroundedRole, RoleModels | null>
>;

const PRO_GROUNDED_CATALOG_BY_ROLE = {
  research: [],
  writer: PRO_GROUNDED_WRITER_CATALOG,
  verifier: PRO_GROUNDED_REVIEW_CATALOG,
  advisor: PRO_GROUNDED_REVIEW_CATALOG,
} as const satisfies Record<GroundedRole, readonly string[]>;

export function getGroundedOperationPolicy(
  tier: SubscriptionTier,
  operation: GroundedOperation,
): GroundedOperationPolicy {
  const role = groundedRole(operation);
  const models: RoleModels | null = GROUNDED_MODELS_BY_TIER[tier][role];
  if (models === null) {
    return { allowed: false };
  }

  return {
    allowed: true,
    models,
    catalog: tier === 'pro' ? PRO_GROUNDED_CATALOG_BY_ROLE[role] : [],
    quotaPerPlan:
      tier === 'free' && operation === 'regeneration'
        ? FREE_GROUNDED_REGENERATION_QUOTA_PER_PLAN
        : null,
    ...(role === 'research' ? { research: RESEARCH_LIMITS_BY_TIER[tier] } : {}),
  };
}

/**
 * Models to send for one grounded request, primary first. A Pro pick leads
 * when it is in the role's catalog; otherwise it is ignored. `null` when the
 * tier does not run the operation.
 */
export function getGroundedModelRoute(
  tier: SubscriptionTier,
  operation: GroundedOperation,
  pickedModelId?: string | null,
): readonly GroundedModelChoice[] | null {
  const policy = getGroundedOperationPolicy(tier, operation);
  if (!policy.allowed) {
    return null;
  }
  if (!pickedModelId || !policy.catalog.includes(pickedModelId)) {
    return policy.models;
  }
  return [
    { modelId: pickedModelId },
    ...policy.models.filter((model) => model.modelId !== pickedModelId),
  ];
}

/** Whether a plan that already ran `used` grounded regenerations may run another. */
export function hasGroundedRegenerationQuota(
  tier: SubscriptionTier,
  used: number,
): boolean {
  const policy = getGroundedOperationPolicy(tier, 'regeneration');
  if (!policy.allowed) {
    return false;
  }
  return policy.quotaPerPlan === null || used < policy.quotaPerPlan;
}
